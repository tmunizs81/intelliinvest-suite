// scheduled-price-refresh — Rotina server-side executada por pg_cron a cada 10min.
// Para cada usuário com holdings, busca cotações no Yahoo, calcula o valor total
// e faz upsert em portfolio_snapshots (mantendo o maior valor do dia).
// Não depende do cliente estar aberto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Holding {
  user_id: string;
  ticker: string;
  quantity: number;
  avg_price: number;
  type: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = performance.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: holdings, error: hErr } = await supabase
      .from("holdings")
      .select("user_id, ticker, quantity, avg_price, type");
    if (hErr) throw hErr;

    // Group tickers globally (dedup) — only market assets
    const marketHoldings = (holdings as Holding[]).filter(
      (h) => h.type !== "Renda Fixa" && h.type !== "Imóvel",
    );
    const tickers = [...new Set(marketHoldings.map((h) => h.ticker))];

    // Call internal yahoo-finance function once with all tickers
    let quotes: Record<string, { currentPriceBRL: number }> = {};
    if (tickers.length > 0) {
      const r = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/yahoo-finance`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ tickers }),
        },
      );
      if (r.ok) {
        const j = await r.json();
        quotes = j.quotes || {};
      } else {
        console.warn("yahoo-finance failed:", r.status);
      }
    }

    // Aggregate per user
    const byUser = new Map<string, { total: number; cost: number; count: number }>();
    for (const h of holdings as Holding[]) {
      const agg = byUser.get(h.user_id) ?? { total: 0, cost: 0, count: 0 };
      const q = quotes[h.ticker];
      const price = q?.currentPriceBRL || h.avg_price; // fallback: cost basis
      agg.total += price * Number(h.quantity);
      agg.cost += Number(h.avg_price) * Number(h.quantity);
      agg.count += 1;
      byUser.set(h.user_id, agg);
    }

    const today = new Date().toISOString().split("T")[0];
    let upserts = 0;

    for (const [user_id, agg] of byUser) {
      // Keep the HIGHEST intraday value (matches upsert_daily_snapshot logic)
      const { data: existing } = await supabase
        .from("portfolio_snapshots")
        .select("id, total_value")
        .eq("user_id", user_id)
        .eq("snapshot_date", today)
        .maybeSingle();

      if (existing) {
        const newVal = Math.max(Number((existing as any).total_value), agg.total);
        await supabase
          .from("portfolio_snapshots")
          .update({
            total_value: newVal,
            total_cost: agg.cost,
            assets_count: agg.count,
          })
          .eq("id", (existing as any).id);
      } else {
        await supabase.from("portfolio_snapshots").insert({
          user_id,
          snapshot_date: today,
          total_value: agg.total,
          total_cost: agg.cost,
          assets_count: agg.count,
        });
      }
      upserts++;
    }

    const durationMs = Math.round(performance.now() - started);
    console.log(
      `scheduled-price-refresh: ${upserts} users, ${tickers.length} tickers in ${durationMs}ms`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        users_updated: upserts,
        tickers_fetched: tickers.length,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("scheduled-price-refresh error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
