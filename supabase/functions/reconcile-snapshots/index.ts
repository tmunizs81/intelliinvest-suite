// reconcile-snapshots — Reprocessa snapshots pendentes registrados em
// snapshot_refresh_failures. Roda por pg_cron a cada 15min e também pode ser
// disparado sob demanda pelo cliente (via supabase.functions.invoke).
//
// Estratégia:
//   1. list_pending_snapshot_failures() → lote de falhas maduras.
//   2. Para cada usuário: busca holdings, refaz cotações Yahoo, reaplica o
//      snapshot do dia mantendo o maior valor intraday.
//   3. Sucesso → mark_snapshot_failure_resolved. Falha → enqueue_snapshot_failure
//      (bump attempts + backoff exponencial).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Holding {
  user_id: string; ticker: string; quantity: number; avg_price: number; type: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = performance.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: pending, error } = await supabase.rpc("list_pending_snapshot_failures", { _limit: 50 });
    if (error) throw error;

    const rows = (pending ?? []) as Array<{ user_id: string; attempts: number }>;
    if (rows.length === 0) {
      return json({ success: true, processed: 0, resolved: 0, still_failing: 0, duration_ms: 0 });
    }

    const today = new Date().toISOString().split("T")[0];
    let resolved = 0;
    let stillFailing = 0;

    for (const row of rows) {
      try {
        const { data: holdings } = await supabase
          .from("holdings")
          .select("user_id, ticker, quantity, avg_price, type")
          .eq("user_id", row.user_id);

        const hs = (holdings ?? []) as Holding[];
        if (hs.length === 0) {
          await supabase.rpc("mark_snapshot_failure_resolved", { _user_id: row.user_id });
          resolved++; continue;
        }

        const market = hs.filter((h) => h.type !== "Renda Fixa" && h.type !== "Imóvel");
        const tickers = [...new Set(market.map((h) => h.ticker))];

        let quotes: Record<string, { currentPriceBRL: number }> = {};
        if (tickers.length > 0) {
          const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/yahoo-finance`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ tickers }),
          });
          if (!r.ok) throw new Error(`yahoo ${r.status}`);
          quotes = (await r.json()).quotes || {};
        }

        const missing: string[] = [];
        let total = 0, cost = 0, count = 0;
        for (const h of hs) {
          const q = quotes[h.ticker];
          if (!q?.currentPriceBRL && h.type !== "Renda Fixa" && h.type !== "Imóvel") missing.push(h.ticker);
          total += (q?.currentPriceBRL || h.avg_price) * Number(h.quantity);
          cost += Number(h.avg_price) * Number(h.quantity);
          count += 1;
        }

        const { data: existing } = await supabase
          .from("portfolio_snapshots")
          .select("id, total_value")
          .eq("user_id", row.user_id).eq("snapshot_date", today).maybeSingle();

        if (existing) {
          const newVal = Math.max(Number((existing as any).total_value), total);
          const { error: uErr } = await supabase
            .from("portfolio_snapshots")
            .update({ total_value: newVal, total_cost: cost, assets_count: count })
            .eq("id", (existing as any).id);
          if (uErr) throw uErr;
        } else {
          const { error: iErr } = await supabase.from("portfolio_snapshots").insert({
            user_id: row.user_id, snapshot_date: today,
            total_value: total, total_cost: cost, assets_count: count,
          });
          if (iErr) throw iErr;
        }

        if (missing.length > 0) {
          await supabase.rpc("enqueue_snapshot_failure", {
            _user_id: row.user_id,
            _reason: `missing_quotes:${missing.slice(0, 5).join(",")}`,
            _source: "reconcile-snapshots",
            _error: `${missing.length} tickers ainda sem cotação`,
          });
          stillFailing++;
        } else {
          await supabase.rpc("mark_snapshot_failure_resolved", { _user_id: row.user_id });
          resolved++;
        }
      } catch (e) {
        stillFailing++;
        await supabase.rpc("enqueue_snapshot_failure", {
          _user_id: row.user_id,
          _reason: "reconcile_failed",
          _source: "reconcile-snapshots",
          _error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    const durationMs = Math.round(performance.now() - started);
    console.log(`reconcile-snapshots: processed=${rows.length} resolved=${resolved} still=${stillFailing} in ${durationMs}ms`);
    return json({ success: true, processed: rows.length, resolved, still_failing: stillFailing, duration_ms: durationMs });
  } catch (err) {
    console.error("reconcile-snapshots error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
