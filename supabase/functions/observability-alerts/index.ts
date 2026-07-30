/**
 * Alertas de observabilidade (cron).
 *
 * Lê `function_metrics` / `security_events` / `job_queue` das últimas N minutos
 * e dispara aviso no Telegram para os admins quando algum limiar estoura:
 *  - p95 de latência por rota
 *  - taxa de erro 5xx
 *  - taxa de rejeição (429 / 401)
 *  - fila travada (jobs pendentes há muito tempo ou falhas)
 *  - custo estimado de IA na janela
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, requireCron } from "../_shared/auth.ts";
import { sendTelegramRaw } from "../_shared/telegram.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const THRESHOLDS = {
  windowMinutes: 15,
  p95Ms: 6000,
  errorRatePct: 10,
  minCalls: 10,
  rejectionRatePct: 25,
  queuePendingMax: 25,
  queueStuckMinutes: 20,
  aiCostUsdPerWindow: 2,
};

function pct(a: number, b: number) {
  return b > 0 ? (a / b) * 100 : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = requireCron(req);
  if (denied) return denied;

  const since = new Date(Date.now() - THRESHOLDS.windowMinutes * 60_000).toISOString();
  const problems: string[] = [];

  // --- Latência e erros por rota ---
  const { data: metrics } = await admin
    .from("function_metrics")
    .select("function_name,duration_ms,status_code,tokens_in,tokens_out")
    .gte("created_at", since)
    .limit(10000);

  const byRoute = new Map<string, number[]>();
  const errByRoute = new Map<string, number>();
  let tokIn = 0, tokOut = 0;

  for (const m of (metrics ?? []) as any[]) {
    const arr = byRoute.get(m.function_name) ?? [];
    arr.push(m.duration_ms ?? 0);
    byRoute.set(m.function_name, arr);
    if ((m.status_code ?? 200) >= 500) {
      errByRoute.set(m.function_name, (errByRoute.get(m.function_name) ?? 0) + 1);
    }
    if (String(m.function_name).startsWith("ai-")) {
      tokIn += m.tokens_in ?? 0;
      tokOut += m.tokens_out ?? 0;
    }
  }

  for (const [route, durations] of byRoute) {
    if (durations.length < THRESHOLDS.minCalls) continue;
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    if (p95 > THRESHOLDS.p95Ms) {
      problems.push(`🐌 <b>${route}</b>: p95 ${Math.round(p95)}ms (limite ${THRESHOLDS.p95Ms}ms, ${durations.length} chamadas)`);
    }
    const errRate = pct(errByRoute.get(route) ?? 0, durations.length);
    if (errRate > THRESHOLDS.errorRatePct) {
      problems.push(`💥 <b>${route}</b>: ${errRate.toFixed(1)}% de erros 5xx`);
    }
  }

  // --- Rejeições (401/429) ---
  const { data: events } = await admin
    .from("security_events")
    .select("function_name,outcome,status_code")
    .gte("created_at", since)
    .limit(10000);

  const totalCalls = (metrics ?? []).length || 1;
  const rejections = (events ?? []).length;
  const rejRate = pct(rejections, totalCalls + rejections);
  if (rejections >= 10 && rejRate > THRESHOLDS.rejectionRatePct) {
    problems.push(`🚫 Taxa de rejeição em ${rejRate.toFixed(1)}% (${rejections} eventos 401/429 na janela)`);
  }

  // --- Fila ---
  const { data: pending } = await admin
    .from("job_queue")
    .select("id,created_at,status")
    .in("status", ["pending", "running"])
    .limit(500);

  const pendingCount = (pending ?? []).length;
  if (pendingCount > THRESHOLDS.queuePendingMax) {
    problems.push(`📦 Fila com ${pendingCount} tarefas pendentes/executando`);
  }
  const stuckLimit = Date.now() - THRESHOLDS.queueStuckMinutes * 60_000;
  const stuck = (pending ?? []).filter((j: any) => new Date(j.created_at).getTime() < stuckLimit);
  if (stuck.length > 0) {
    problems.push(`⏳ ${stuck.length} tarefa(s) parada(s) há mais de ${THRESHOLDS.queueStuckMinutes} min`);
  }

  const { count: failedCount } = await admin
    .from("job_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .gte("created_at", since);
  if ((failedCount ?? 0) > 0) {
    problems.push(`❌ ${failedCount} tarefa(s) falharam definitivamente na janela`);
  }

  // --- Custo IA ---
  const costUsd = tokIn * 0.00000027 + tokOut * 0.0000011;
  if (costUsd > THRESHOLDS.aiCostUsdPerWindow) {
    problems.push(`💸 Custo de IA em US$${costUsd.toFixed(3)} nos últimos ${THRESHOLDS.windowMinutes} min`);
  }

  let notified = 0;
  if (problems.length > 0) {
    const html =
      `⚠️ <b>Observabilidade — SimplyNvest</b>\n` +
      `Janela: últimos ${THRESHOLDS.windowMinutes} min\n\n` +
      problems.map((p) => `• ${p}`).join("\n");

    const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (admins ?? []).map((a: any) => a.user_id);
    if (ids.length > 0) {
      const { data: chats } = await admin
        .from("telegram_settings")
        .select("user_id,chat_id,enabled")
        .in("user_id", ids);
      for (const c of (chats ?? []) as any[]) {
        if (!c.chat_id || c.enabled === false) continue;
        try {
          await sendTelegramRaw(c.chat_id, html);
          notified++;
        } catch (e) {
          console.error("[observability-alerts] telegram falhou:", (e as Error).message);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({
      window_minutes: THRESHOLDS.windowMinutes,
      problems,
      notified,
      metrics_sampled: (metrics ?? []).length,
      estimated_ai_cost_usd: Number(costUsd.toFixed(4)),
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
