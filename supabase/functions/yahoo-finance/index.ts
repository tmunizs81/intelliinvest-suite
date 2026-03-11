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
  source: string;
  error?: string;
}

// ─── Source 1: Brapi (Brazilian API - best for B3 + Crypto) ───
async function fetchBrapiQuote(ticker: string): Promise<QuoteResult | null> {
  try {
    // Brapi uses the raw ticker for B3 stocks and special endpoints for crypto
    const isCrypto = ["BTC", "ETH", "SOL", "ADA", "DOT", "AVAX", "MATIC", "LINK", "UNI", "DOGE", "XRP", "BNB", "LTC"].includes(ticker);

    if (isCrypto) {
      const url = `https://brapi.dev/api/v2/crypto?coin=${ticker}&currency=BRL`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const coin = data.coins?.[0];
      if (!coin) return null;

      const currentPrice = coin.regularMarketPrice ?? 0;
      const change24h = coin.regularMarketChangePercent ?? 0;
      const previousClose = currentPrice / (1 + change24h / 100);

      return {
        ticker,
        currentPrice,
        change24h: Math.round(change24h * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        name: coin.coinName || coin.coin || ticker,
        source: "brapi",
      };
    }

    // B3 stocks/FIIs/ETFs
    const url = `https://brapi.dev/api/quote/${ticker}?fundamental=false`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results?.[0];
    if (!result) return null;

    return {
      ticker,
      currentPrice: result.regularMarketPrice ?? 0,
      change24h: Math.round((result.regularMarketChangePercent ?? 0) * 100) / 100,
      previousClose: result.regularMarketPreviousClose ?? result.previousClose ?? 0,
      name: result.shortName || result.longName || result.symbol || ticker,
      source: "brapi",
    };
  } catch (err) {
    console.warn(`Brapi failed for ${ticker}:`, err);
    return null;
  }
}

// ─── Source 2: Yahoo Finance (global fallback) ───
function mapToYahooTicker(ticker: string): string {
  const mappings: Record<string, string> = {
    BTC: "BTC-USD",
    ETH: "ETH-USD",
    SOL: "SOL-USD",
    ADA: "ADA-USD",
    DOT: "DOT-USD",
    XRP: "XRP-USD",
    BNB: "BNB-USD",
    DOGE: "DOGE-USD",
    LTC: "LTC-USD",
    AVAX: "AVAX-USD",
    MATIC: "MATIC-USD",
    LINK: "LINK-USD",
    UNI: "UNI-USD",
  };
  if (mappings[ticker]) return mappings[ticker];
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) return `${ticker}.SA`;
  return ticker;
}

async function fetchYahooQuote(ticker: string): Promise<QuoteResult | null> {
  const yahooTicker = mapToYahooTicker(ticker);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=2d`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.warn(`Yahoo Finance HTTP ${resp.status} for ${yahooTicker}`);
      return null;
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    let currentPrice = meta.regularMarketPrice ?? 0;
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
    const change24h = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;

    // For crypto mapped to USD, convert to BRL using exchange rate
    const isCryptoUSD = ["BTC", "ETH", "SOL", "ADA", "DOT", "XRP", "BNB", "DOGE", "LTC", "AVAX", "MATIC", "LINK", "UNI"].includes(ticker);
    if (isCryptoUSD && currentPrice > 0) {
      const usdBrl = await getUsdBrlRate();
      currentPrice = currentPrice * usdBrl;
      const prevBrl = previousClose * usdBrl;
      return {
        ticker,
        currentPrice: Math.round(currentPrice * 100) / 100,
        change24h: Math.round(change24h * 100) / 100,
        previousClose: Math.round(prevBrl * 100) / 100,
        name: meta.shortName || meta.symbol || ticker,
        source: "yahoo",
      };
    }

    return {
      ticker,
      currentPrice,
      change24h: Math.round(change24h * 100) / 100,
      previousClose,
      name: meta.shortName || meta.symbol || ticker,
      source: "yahoo",
    };
  } catch (err) {
    console.warn(`Yahoo Finance failed for ${yahooTicker}:`, err);
    return null;
  }
}

// ─── USD/BRL exchange rate (cached per request batch) ───
let cachedUsdBrl: number | null = null;

async function getUsdBrlRate(): Promise<number> {
  if (cachedUsdBrl) return cachedUsdBrl;
  try {
    // Try Brapi first
    const resp = await fetch("https://brapi.dev/api/v2/currency?search=USD-BRL", {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const rate = data.currency?.[0]?.bidPrice;
      if (rate) {
        cachedUsdBrl = parseFloat(rate);
        return cachedUsdBrl;
      }
    }
  } catch { /* fallback */ }

  try {
    // Fallback: Yahoo Finance
    const resp = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/USDBRL=X?interval=1d&range=1d", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) {
        cachedUsdBrl = price;
        return cachedUsdBrl;
      }
    }
  } catch { /* fallback */ }

  cachedUsdBrl = 5.5; // safe fallback
  return cachedUsdBrl;
}

// ─── Multi-source fetch with fallback ───
async function fetchQuoteWithFallback(ticker: string): Promise<QuoteResult> {
  // Source 1: Brapi (primary for BR assets)
  const brapiResult = await fetchBrapiQuote(ticker);
  if (brapiResult && brapiResult.currentPrice > 0) {
    return brapiResult;
  }

  // Source 2: Yahoo Finance (fallback)
  const yahooResult = await fetchYahooQuote(ticker);
  if (yahooResult && yahooResult.currentPrice > 0) {
    return yahooResult;
  }

  // All sources failed
  return {
    ticker,
    currentPrice: 0,
    change24h: 0,
    previousClose: 0,
    name: ticker,
    source: "none",
    error: "All sources failed",
  };
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

    // Reset USD/BRL cache for each request
    cachedUsdBrl = null;

    const limitedTickers = tickers.slice(0, 30);
    const quotes = await Promise.all(limitedTickers.map((t: string) => fetchQuoteWithFallback(t)));

    const quotesMap: Record<string, QuoteResult> = {};
    for (const q of quotes) {
      quotesMap[q.ticker] = q;
    }

    return new Response(
      JSON.stringify({ quotes: quotesMap, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("market-quotes error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
