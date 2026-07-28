// Cron: 12:00 UTC (09:00 São Paulo). Sends portfolio summary to opted-in users.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, dispatchAlert, brl, pct } from "../_shared/telegram.ts";

async function summarizeUser(userId: string, ruleId: string, cooldown: number) {
  const db = admin();

  const { data: snaps } = await db
    .from("portfolio_snapshots").select("total_value, total_cost, snapshot_date")
    .eq("user_id", userId).order("snapshot_date", { ascending: false }).limit(2);
  const cur = snaps?.[0]; const prev = snaps?.[1];
  if (!cur) return;
  const total = Number(cur.total_value);
  const cost = Number(cur.total_cost);
  const prevV = Number(prev?.total_value ?? total);
  const varPct = prevV > 0 ? ((total - prevV) / prevV) * 100 : 0;
  const roi = cost > 0 ? ((total - cost) / cost) * 100 : 0;

  const { data: metrics } = await db
    .from("portfolio_daily_metrics").select("top_holdings")
    .eq("user_id", userId).order("metric_date", { ascending: false }).limit(1).maybeSingle();
  const top: Array<{ ticker: string; invested: number }> =
    (metrics?.top_holdings as any) ?? [];

  const rank = top.slice(0, 3).map((t, i) => `${i + 1}. <code>${t.ticker}</code> — ${brl(Number(t.invested))}`).join("\n");

  const html = `📊 <b>Resumo Diário — SimplyNvest</b>

💼 Patrimônio: <b>${brl(total)}</b>
Δ vs ontem: ${pct(varPct)}
📈 ROI acumulado: ${pct(roi)}

<b>Top 3 posições</b>
${rank || "— sem posições —"}

🔗 <a href="https://simplynvest.t2systems.com.br/">Abrir dashboard</a>`;

  await dispatchAlert({
    userId, ruleId, kind: "daily_summary", html,
    cooldownMinutes: cooldown, payload: { total, varPct, roi },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const { data: rules } = await db
      .from("alert_rules").select("id, user_id, cooldown_minutes")
      .eq("kind", "daily_summary").eq("enabled", true);

    for (const r of rules ?? []) {
      try { await summarizeUser(r.user_id, r.id, r.cooldown_minutes ?? 720); }
      catch (e) { console.error("summary", r.user_id, e); }
    }
    return new Response(JSON.stringify({ ok: true, users: rules?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
