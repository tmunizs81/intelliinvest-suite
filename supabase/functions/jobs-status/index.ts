/**
 * API de acompanhamento das tarefas assíncronas do usuário.
 *
 *   GET  /jobs-status                → lista as tarefas do usuário (+ resumo)
 *   GET  /jobs-status?id=<uuid>      → detalhe de uma tarefa
 *   POST /jobs-status  { action: "cancel", id }   → solicita cancelamento
 *   POST /jobs-status  { action: "retry",  id }   → reenfileira uma que falhou
 *
 * A identidade vem do JWT verificado (`resolveCaller`); as RPCs usadas já
 * filtram por `auth.uid()`, então um usuário nunca enxerga tarefa de outro.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, resolveCaller } from "../_shared/auth.ts";
import { startRequestTrace } from "../_shared/otel.ts";
import { logMetric } from "../_telemetry.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CANCELLABLE = new Set(["pending", "running"]);

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = performance.now();
  const caller = await resolveCaller(req);
  if (caller instanceof Response) return caller;
  const userId = caller.user?.id ?? null;
  if (!userId) return json({ error: "não autenticado" }, 401);

  const tracer = startRequestTrace(req, "jobs-status", userId);
  const authHeader = req.headers.get("Authorization") ?? "";
  // Client com o JWT do usuário: RLS + auth.uid() valem dentro das RPCs.
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const status = url.searchParams.get("status");
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

      const jobs = await tracer.root.trace(
        "db.list_my_jobs", "CLIENT", { "db.operation": "list_my_jobs", "db.system": "postgresql" },
        async () => {
          const { data, error } = await userClient.rpc("list_my_jobs", {
            _limit: limit,
            _status: status,
          });
          if (error) throw new Error(error.message);
          return (data ?? []) as any[];
        },
      );

      const filtered = id ? jobs.filter((j) => j.id === id) : jobs;
      const summary = jobs.reduce<Record<string, number>>((acc, j) => {
        acc[j.status] = (acc[j.status] ?? 0) + 1;
        return acc;
      }, {});

      tracer.root.setAttributes({ "jobs.count": filtered.length, "http.status_code": 200 });
      tracer.root.end("OK");
      tracer.flush();
      logMetric({
        function_name: "jobs-status",
        duration_ms: performance.now() - started,
        status_code: 200,
        user_id: userId,
        trace_id: tracer.traceId,
      });

      return json({
        jobs: filtered.map((j) => ({ ...j, cancellable: CANCELLABLE.has(j.status) })),
        summary,
        trace_id: tracer.traceId,
      });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = String(body?.action ?? "");
      const id = String(body?.id ?? "");

      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id inválido" }, 400);

      if (action === "cancel") {
        const result = await tracer.root.trace(
          "db.cancel_my_job", "CLIENT", { "db.operation": "cancel_my_job", "job.id": id },
          async () => {
            const { data, error } = await userClient.rpc("cancel_my_job", { _job_id: id });
            if (error) throw new Error(error.message);
            return data as Record<string, unknown>;
          },
        );
        tracer.root.setAttributes({ "http.status_code": 200 });
        tracer.root.end("OK");
        tracer.flush();
        return json(result);
      }

      if (action === "retry") {
        const result = await tracer.root.trace(
          "db.retry_job", "CLIENT", { "db.operation": "enqueue_job", "job.id": id },
          async () => {
            const { data: jobs, error } = await userClient.rpc("list_my_jobs", { _limit: 200, _status: null });
            if (error) throw new Error(error.message);
            const job = (jobs ?? []).find((j: any) => j.id === id);
            if (!job) throw new Error("tarefa não encontrada");
            if (!["failed", "cancelled"].includes(job.status)) {
              throw new Error("só é possível reprocessar tarefas falhas ou canceladas");
            }
            const { data: newId, error: enqErr } = await userClient.rpc("enqueue_job", {
              _job_type: job.job_type,
              _payload: job.payload ?? {},
              _dedupe_key: null,
              _priority: 6,
            });
            if (enqErr) throw new Error(enqErr.message);
            return { ok: true, id: newId };
          },
        );
        tracer.root.end("OK");
        tracer.flush();
        return json(result);
      }

      return json({ error: "ação desconhecida" }, 400);
    }

    return json({ error: "método não suportado" }, 405);
  } catch (e) {
    const message = (e as Error).message ?? "erro";
    tracer.root.setError(e).setAttributes({ "http.status_code": 500 });
    tracer.root.end("ERROR");
    tracer.flush();
    logMetric({
      function_name: "jobs-status",
      duration_ms: performance.now() - started,
      status_code: 500,
      user_id: userId,
      error_message: message,
      trace_id: tracer.traceId,
    });
    return json({ error: message, trace_id: tracer.traceId }, 500);
  }
});
