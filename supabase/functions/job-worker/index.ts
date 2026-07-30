/**
 * Worker da fila (`public.job_queue`).
 *
 * Chamado por cron (x-cron-secret) a cada minuto. Reivindica jobs com
 * SKIP LOCKED e concorrência máxima de 1 job simultâneo por usuário, executa
 * a função pesada correspondente e grava o resultado no próprio job — o
 * frontend acompanha por polling/realtime em `job_queue`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, requireCron } from "../_shared/auth.ts";
import { startRequestTrace, injectHeaders, type Span } from "../_shared/otel.ts";
import { logMetric } from "../_telemetry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET =
  Deno.env.get("CRON_SECRET") || Deno.env.get("CRON_SHARED_SECRET") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** job_type → edge function invocada internamente. */
const HANDLERS: Record<string, string> = {
  "ai-insights": "ai-insights",
  "ai-trader": "ai-trader",
  "ai-risk-analysis": "ai-risk-analysis",
  "ai-correlation": "ai-correlation",
  "portfolio-rebalance": "portfolio-rebalance",
  "reconcile-snapshots": "reconcile-snapshots",
  "monthly-report": "monthly-report",
  "backtesting": "backtesting",
};

/** Timeout duro por job para não segurar o lock indefinidamente. */
const JOB_TIMEOUT_MS = 110_000;

interface Job {
  id: string;
  user_id: string | null;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

async function runJob(job: Job, span: Span): Promise<unknown> {
  const fn = HANDLERS[job.job_type];
  if (!fn) throw new Error(`job_type não suportado: ${job.job_type}`);

  // O traceparent segue para a função pesada: o span da IA aparece no MESMO
  // trace do enfileiramento, fechando a correlação rota → fila → worker → IA.
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: injectHeaders(span, {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE}`,
      "x-cron-secret": CRON_SECRET,
      "x-job-id": job.id,
      "x-job-user": job.user_id ?? "",
    }),
    body: JSON.stringify({ ...job.payload, _jobId: job.id, _userId: job.user_id }),
    signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`${fn} HTTP ${resp.status}: ${text.slice(0, 400)}`);

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = requireCron(req);
  if (denied) return denied;

  const started = performance.now();
  const tracer = startRequestTrace(req, "job-worker", null, { "messaging.system": "job_queue" });
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 5) || 5, 20);
  const maxPerUser = Math.min(Number(url.searchParams.get("perUser") ?? 1) || 1, 5);

  const { data: claimed, error } = await admin.rpc("claim_jobs", {
    _limit: limit,
    _max_per_user: maxPerUser,
    _lock_timeout_seconds: 300,
  });

  if (error) {
    console.error("[job-worker] claim falhou:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const jobs = (claimed ?? []) as Job[];
  const results = await Promise.all(
    jobs.map(async (job) => {
      const jobStarted = performance.now();
      const jobSpan = tracer.root.child(`job ${job.job_type}`, "CONSUMER", {
        "messaging.operation": "process",
        "messaging.message.id": job.id,
        "job.type": job.job_type,
        "enduser.id": job.user_id ?? "",
        "job.attempts": job.attempts,
      });
      try {
        // Job cancelado enquanto esperava na fila não deve consumir recurso.
        const { data: current } = await admin
          .from("job_queue").select("status").eq("id", job.id).maybeSingle();
        if ((current as { status?: string } | null)?.status === "cancelled") {
          jobSpan.setAttributes({ "job.skipped": "cancelled" }).end("OK");
          return { id: job.id, type: job.job_type, ok: true, skipped: "cancelled" };
        }

        const result = await runJob(job, jobSpan);
        await admin.rpc("complete_job", { _job_id: job.id, _result: result, _error: null });
        logMetric({
          function_name: `job:${job.job_type}`,
          duration_ms: performance.now() - jobStarted,
          status_code: 200,
          user_id: job.user_id,
          trace_id: tracer.traceId,
          meta: { attempts: job.attempts },
        });
        jobSpan.end("OK");
        return { id: job.id, type: job.job_type, ok: true };
      } catch (e) {
        const message = (e as Error).message ?? "erro desconhecido";
        await admin.rpc("complete_job", { _job_id: job.id, _result: null, _error: message });
        logMetric({
          function_name: `job:${job.job_type}`,
          duration_ms: performance.now() - jobStarted,
          status_code: 500,
          user_id: job.user_id,
          error_message: message,
          trace_id: tracer.traceId,
          meta: { attempts: job.attempts },
        });
        jobSpan.setError(e).end("ERROR");
        return { id: job.id, type: job.job_type, ok: false, error: message };
      }
    }),
  );

  tracer.root.setAttributes({ "messaging.batch.message_count": jobs.length, "http.status_code": 200 });
  tracer.root.end("OK");
  tracer.flush();

  return new Response(
    JSON.stringify({
      trace_id: tracer.traceId,
      claimed: jobs.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      duration_ms: Math.round(performance.now() - started),
      results,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
