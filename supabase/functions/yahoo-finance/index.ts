import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface QuoteResult {
  ticker: string;
  currentPrice: number;
  change24h: number;
  previousClose: number;
  name: string;
  error?: string;
}

async function fetchYahooQuote(ticker: string): Promise<QuoteResult> {
  // Map BR tickers to Yahoo Finance format
  const yahooTicker = mapToYahooTicker(ticker);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=2d`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!resp.ok) {
      console.error(`Yahoo Finance error for ${yahooTicker}: ${resp.status}`);
      return { ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker, error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];

    if (!result) {
      return { ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker, error: "No data" };
    }

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice ?? 0;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
    const change24h = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;

    return {
      ticker,
      currentPrice,
      change24h: Math.round(change24h * 100) / 100,
      previousClose,
      name: meta.shortName || meta.symbol || ticker,
    };
  } catch (err) {
    console.error(`Error fetching ${yahooTicker}:`, err);
    return { ticker, currentPrice: 0, change24h: 0, previousClose: 0, name: ticker, error: String(err) };
  }
}

function mapToYahooTicker(ticker: string): string {
  const mappings: Record<string, string> = {
    BTC: "BTC-BRL",
    ETH: "ETH-BRL",
    "TESOURO SELIC": "^IRX", // fallback, won't be perfect
  };

  if (mappings[ticker]) return mappings[ticker];

  // Brazilian stocks/FIIs/ETFs - append .SA
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) {
    return `${ticker}.SA`;
  }

  return ticker;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers } = await req.json();

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return new Response(
        JSON.stringify({ error: "tickers array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Limit to 30 tickers per request
    const limitedTickers = tickers.slice(0, 30);

    // Fetch all in parallel
    const quotes = await Promise.all(limitedTickers.map((t: string) => fetchYahooQuote(t)));

    const quotesMap: Record<string, QuoteResult> = {};
    for (const q of quotes) {
      quotesMap[q.ticker] = q;
    }

    return new Response(
      JSON.stringify({ quotes: quotesMap, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("yahoo-finance error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
