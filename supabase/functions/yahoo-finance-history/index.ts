import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function mapToYahooTicker(ticker: string): string {
  const mappings: Record<string, string> = {
    BTC: "BTC-BRL",
    ETH: "ETH-BRL",
    "TESOURO SELIC": "^IRX",
  };
  if (mappings[ticker]) return mappings[ticker];
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) return `${ticker}.SA`;
  return ticker;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, range = "6mo", interval = "1d" } = await req.json();

    if (!ticker) {
      return new Response(
        JSON.stringify({ error: "ticker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const yahooTicker = mapToYahooTicker(ticker);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=${interval}&range=${range}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `Yahoo Finance HTTP ${resp.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return new Response(
        JSON.stringify({ error: "No data returned" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const { open, high, low, close, volume } = quote;

    const candles = timestamps.map((ts: number, i: number) => ({
      date: new Date(ts * 1000).toISOString().split("T")[0],
      timestamp: ts,
      open: open?.[i] ?? null,
      high: high?.[i] ?? null,
      low: low?.[i] ?? null,
      close: close?.[i] ?? null,
      volume: volume?.[i] ?? 0,
    })).filter((c: any) => c.open !== null && c.close !== null);

    const meta = result.meta;

    return new Response(
      JSON.stringify({
        ticker,
        currency: meta?.currency || "BRL",
        name: meta?.shortName || meta?.symbol || ticker,
        currentPrice: meta?.regularMarketPrice ?? 0,
        previousClose: meta?.chartPreviousClose ?? meta?.previousClose ?? 0,
        candles,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("yahoo-finance-history error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
