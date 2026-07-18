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
    const yahooOk = tickers.length === 0 || Object.keys(quotes).length > 0;

    // Aggregate per user
    const byUser = new Map<string, { total: number; cost: number; count: number; missing: string[] }>();
    for (const h of holdings as Holding[]) {
      const agg = byUser.get(h.user_id) ?? { total: 0, cost: 0, count: 0, missing: [] };
      const q = quotes[h.ticker];
      const price = q?.currentPriceBRL || h.avg_price; // fallback: cost basis
      if (!q?.currentPriceBRL && h.type !== "Renda Fixa" && h.type !== "Imóvel") {
        agg.missing.push(h.ticker);
      }
      agg.total += price * Number(h.quantity);
      agg.cost += Number(h.avg_price) * Number(h.quantity);
      agg.count += 1;
      byUser.set(h.user_id, agg);
    }

    const today = new Date().toISOString().split("T")[0];
    let upserts = 0;
    let failures = 0;

    for (const [user_id, agg] of byUser) {
      try {
        const { data: existing } = await supabase
          .from("portfolio_snapshots")
          .select("id, total_value")
          .eq("user_id", user_id)
          .eq("snapshot_date", today)
          .maybeSingle();

        if (existing) {
          const newVal = Math.max(Number((existing as any).total_value), agg.total);
          const { error } = await supabase
            .from("portfolio_snapshots")
            .update({ total_value: newVal, total_cost: agg.cost, assets_count: agg.count })
            .eq("id", (existing as any).id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("portfolio_snapshots").insert({
            user_id, snapshot_date: today,
            total_value: agg.total, total_cost: agg.cost, assets_count: agg.count,
          });
          if (error) throw error;
        }

        // Partial success: some tickers were missing from Yahoo → enqueue for retry
        if (!yahooOk || agg.missing.length > 0) {
          const reason = !yahooOk ? "yahoo_unreachable" : `missing_quotes:${agg.missing.slice(0, 5).join(",")}`;
          await supabase.rpc("enqueue_snapshot_failure", {
            _user_id: user_id, _reason: reason, _source: "scheduled-price-refresh",
            _error: agg.missing.length > 0 ? `${agg.missing.length} tickers sem cotação` : "yahoo indisponível",
          });
          failures++;
        } else {
          await supabase.rpc("mark_snapshot_failure_resolved", { _user_id: user_id });
        }
        upserts++;
      } catch (e) {
        failures++;
        await supabase.rpc("enqueue_snapshot_failure", {
          _user_id: user_id, _reason: "upsert_failed",
          _source: "scheduled-price-refresh",
          _error: e instanceof Error ? e.message : String(e),
        });
      }
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
