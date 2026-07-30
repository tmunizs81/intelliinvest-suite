// Dry-run: evaluates alert rules for the calling user WITHOUT sending Telegram messages.
// Returns which rules would fire and the message that would be dispatched.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCaller } from "../_shared/auth.ts";

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Somente sessão válida (ou chamada interna cron/service): evita uso do endpoint
  // como proxy gratuito de LLM e vazamento de dados entre contas.
  const denied = await requireCaller(req);
  if (denied) return denied;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders });

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const asUser = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData } = await asUser.auth.getUser();
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: corsHeaders });

    const db = createClient(url, service);
    const { ruleId } = await req.json().catch(() => ({ ruleId: null }));

    const q = db.from("alert_rules").select("*").eq("user_id", user.id);
    const { data: rules } = ruleId ? await q.eq("id", ruleId) : await q;

    const { data: snaps } = await db
      .from("portfolio_snapshots")
      .select("total_value, total_cost, snapshot_date")
      .eq("user_id", user.id)
      .order("snapshot_date", { ascending: false })
      .limit(2);

    const cur = snaps?.[0]; const prev = snaps?.[1];
    const totalValue = Number(cur?.total_value ?? 0);
    const totalCost = Number(cur?.total_cost ?? 0);
    const prevValue = Number(prev?.total_value ?? totalValue);
    const variationPct = prevValue > 0 ? ((totalValue - prevValue) / prevValue) * 100 : 0;
    const roiPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    const { data: fx } = await db
      .from("ai_cache")
      .select("created_at")
      .eq("function_name", "fx-cache")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fxMins = fx?.created_at ? (Date.now() - new Date(fx.created_at).getTime()) / 60000 : Infinity;

    const results = (rules ?? []).map((r: any) => {
      let fire = false; let title = ""; let reason = "";
      const th = Number(r.threshold_pct ?? 0);
      switch (r.kind) {
        case "patrimony_drop":
          fire = variationPct <= -Math.abs(th);
          title = "🔴 Queda de Patrimônio";
          reason = `variação ${pct(variationPct)} vs limite -${th}%`;
          break;
        case "patrimony_gain":
          fire = variationPct >= Math.abs(th);
          title = "🟢 Ganho de Patrimônio";
          reason = `variação ${pct(variationPct)} vs limite +${th}%`;
          break;
        case "daily_valuation":
          fire = Math.abs(variationPct) >= Math.abs(th);
          title = variationPct >= 0 ? "📈 Valorização Diária" : "📉 Desvalorização Diária";
          reason = `|${pct(variationPct)}| vs limite ${th}%`;
          break;
        case "roi_threshold":
          fire = Math.abs(roiPct) >= Math.abs(th);
          title = roiPct >= 0 ? "🏆 ROI acima do limite" : "⚠️ ROI abaixo do limite";
          reason = `ROI ${pct(roiPct)} vs limite ±${th}%`;
          break;
        case "fx_stale": {
          const limit = Number(r.threshold_minutes ?? 120);
          fire = fxMins >= limit;
          title = "⏱️ Cotação FX desatualizada";
          reason = `FX desatualizado há ${Number.isFinite(fxMins) ? Math.round(fxMins) : "∞"} min (limite ${limit} min)`;
          break;
        }
        case "daily_summary":
          fire = r.enabled;
          title = "🗓️ Resumo Diário";
          reason = "Enviado diariamente às 09:00 BRT quando ativo";
          break;
      }
      const message = fire
        ? `${title}\nVariação: ${pct(variationPct)}\nPatrimônio: ${brl(totalValue)}\nAnterior: ${brl(prevValue)}\nROI: ${pct(roiPct)}`
        : null;
      return {
        id: r.id, kind: r.kind, enabled: r.enabled, fire, title, reason,
        threshold: r.threshold_pct ?? r.threshold_minutes,
        cooldown_minutes: r.cooldown_minutes, message,
      };
    });

    return new Response(JSON.stringify({
      context: { totalValue, prevValue, totalCost, variationPct, roiPct, fxMinutesStale: Number.isFinite(fxMins) ? Math.round(fxMins) : null },
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
