// Cron: every 10 min. Evaluates all active rules and dispatches Telegram alerts.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, dispatchAlert, brl, pct } from "../_shared/telegram.ts";
import { requireCron } from "../_shared/auth.ts";

interface Rule {
  id: string; user_id: string; kind: string; threshold_pct: number | null;
  threshold_minutes: number | null; enabled: boolean; cooldown_minutes: number;
}

async function evalUser(rules: Rule[]) {
  const db = admin();
  const userId = rules[0].user_id;

  // Snapshots (last two)
  const { data: snaps } = await db
    .from("portfolio_snapshots")
    .select("total_value, total_cost, snapshot_date")
    .eq("user_id", userId)
    .order("snapshot_date", { ascending: false })
    .limit(2);

  const cur = snaps?.[0]; const prev = snaps?.[1];
  const totalValue = Number(cur?.total_value ?? 0);
  const totalCost = Number(cur?.total_cost ?? 0);
  const prevValue = Number(prev?.total_value ?? totalValue);
  const variationPct = prevValue > 0 ? ((totalValue - prevValue) / prevValue) * 100 : 0;
  const roiPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  for (const r of rules) {
    if (!r.enabled) continue;
    let fire = false;
    let title = "";
    const th = Number(r.threshold_pct ?? 0);

    switch (r.kind) {
      case "patrimony_drop":
        if (variationPct <= -Math.abs(th)) { fire = true; title = `🔴 <b>Queda de Patrimônio</b>`; }
        break;
      case "patrimony_gain":
        if (variationPct >= Math.abs(th)) { fire = true; title = `🟢 <b>Ganho de Patrimônio</b>`; }
        break;
      case "daily_valuation":
        if (Math.abs(variationPct) >= Math.abs(th)) {
          fire = true; title = variationPct >= 0 ? `📈 <b>Valorização Diária</b>` : `📉 <b>Desvalorização Diária</b>`;
        }
        break;
      case "roi_threshold":
        if (Math.abs(roiPct) >= Math.abs(th)) {
          fire = true; title = roiPct >= 0 ? `🏆 <b>ROI acima do limite</b>` : `⚠️ <b>ROI abaixo do limite</b>`;
        }
        break;
      case "fx_stale": {
        // Check latest FX snapshot in ai_cache with function_name='fx-cache' (best-effort)
        const { data: fx } = await db
          .from("ai_cache")
          .select("created_at")
          .eq("function_name", "fx-cache")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const mins = fx?.created_at ? (Date.now() - new Date(fx.created_at).getTime()) / 60000 : Infinity;
        const limit = Number(r.threshold_minutes ?? 120);
        if (mins >= limit) { fire = true; title = `⏱️ <b>Cotação FX desatualizada</b>`; }
        break;
      }
    }

    if (fire) {
      const html = `${title}
Variação: ${pct(variationPct)}
Patrimônio atual: ${brl(totalValue)}
Anterior: ${brl(prevValue)}
ROI acumulado: ${pct(roiPct)}

🔗 <a href="https://simplynvest.t2systems.com.br/">Abrir dashboard</a>`;
      await dispatchAlert({
        userId, ruleId: r.id, kind: r.kind, html,
        cooldownMinutes: r.cooldown_minutes,
        payload: { variationPct, totalValue, prevValue, roiPct },
      });
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Rota de automação: exige x-cron-secret (ou service role). Bloqueia chamadas públicas.
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const db = admin();
    const { data: rules } = await db
      .from("alert_rules")
      .select("*")
      .eq("enabled", true)
      .neq("kind", "daily_summary");

    const byUser: Record<string, Rule[]> = {};
    for (const r of (rules ?? []) as Rule[]) (byUser[r.user_id] ??= []).push(r);

    let evaluated = 0;
    for (const uid of Object.keys(byUser)) {
      try { await evalUser(byUser[uid]); evaluated++; } catch (e) { console.error("user", uid, e); }
    }
    return new Response(JSON.stringify({ ok: true, users: evaluated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
