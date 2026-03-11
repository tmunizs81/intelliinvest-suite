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
  currency: string;
  currentPriceBRL: number;
  exchangeRate: number;
  error?: string;
}

// ─── Exchange rates cache ───
const rateCache: Record<string, number> = {};

async function getExchangeRate(from: string): Promise<number> {
  if (from === "BRL") return 1;
  const key = `${from}BRL`;
  if (rateCache[key]) return rateCache[key];

  // Try Yahoo Finance for exchange rates
  const pairs: Record<string, string> = {
    USD: "USDBRL=X",
    EUR: "EURBRL=X",
    GBP: "GBPBRL=X",
    CHF: "CHFBRL=X",
    JPY: "JPYBRL=X",
    CAD: "CADBRL=X",
    AUD: "AUDBRL=X",
    GBp: "GBPBRL=X", // GBp = pence, will divide by 100 later
  };

  const yahooSymbol = pairs[from] || `${from}BRL=X`;

  try {
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price) {
        let rate = price;
        // GBp (pence) → divide by 100 to get GBP rate
        if (from === "GBp") rate = price / 100;
        rateCache[key] = rate;
        return rate;
      }
    }
  } catch (err) {
    console.warn(`Exchange rate fetch failed for ${from}:`, err);
  }

  // Fallback: try Brapi for USD
  if (from === "USD") {
    try {
      const resp = await fetch("https://brapi.dev/api/v2/currency?search=USD-BRL", {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const rate = data.currency?.[0]?.bidPrice;
        if (rate) {
          rateCache[key] = parseFloat(rate);
          return rateCache[key];
        }
      }
    } catch { /* fallback */ }
  }

  // Hardcoded fallbacks
  const fallbacks: Record<string, number> = {
    USD: 5.5, EUR: 6.0, GBP: 7.0, GBp: 0.07, CHF: 6.2, JPY: 0.037, CAD: 4.1, AUD: 3.6,
  };
  rateCache[key] = fallbacks[from] || 5.5;
  return rateCache[key];
}

// ─── Source 1: Brapi (Brazilian API - best for B3 + Crypto) ───
async function fetchBrapiQuote(ticker: string): Promise<QuoteResult | null> {
  try {
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
        currency: "BRL",
        currentPriceBRL: currentPrice,
        exchangeRate: 1,
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
      currency: "BRL",
      currentPriceBRL: result.regularMarketPrice ?? 0,
      exchangeRate: 1,
    };
  } catch (err) {
    console.warn(`Brapi failed for ${ticker}:`, err);
    return null;
  }
}

// ─── Source 2: Yahoo Finance (global fallback) ───
function mapToYahooTicker(ticker: string): string {
  const cryptoMappings: Record<string, string> = {
    BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD", ADA: "ADA-USD",
    DOT: "DOT-USD", XRP: "XRP-USD", BNB: "BNB-USD", DOGE: "DOGE-USD",
    LTC: "LTC-USD", AVAX: "AVAX-USD", MATIC: "MATIC-USD",
    LINK: "LINK-USD", UNI: "UNI-USD",
  };
  if (cryptoMappings[ticker]) return cryptoMappings[ticker];

  // Irish/European ETFs
  const irishEtfs: Record<string, string> = {
    CSPX: "CSPX.L", IWDA: "IWDA.L", EIMI: "EIMI.L", SWDA: "SWDA.L",
    VWRA: "VWRA.L", VWRL: "VWRL.L", VUAA: "VUAA.L", VUSA: "VUSA.L",
    ISAC: "ISAC.L", IEMA: "IEMA.L", EMIM: "EMIM.L", IUIT: "IUIT.L",
    IUAA: "IUAA.L", IDTL: "IDTL.L", AGBP: "AGBP.L", IGLN: "IGLN.L",
    SGLN: "SGLN.L", PHAU: "PHAU.L", IBTM: "IBTM.L", LQDE: "LQDE.L",
    SXRV: "SXRV.DE", SXR8: "SXR8.DE", EUNL: "EUNL.DE", IS3N: "IS3N.DE",
    VGWL: "VGWL.DE", VWCE: "VWCE.DE", VAGF: "VAGF.L", VERX: "VERX.L",
    MEUD: "MEUD.L", VJPN: "VJPN.L", VAPX: "VAPX.L",
  };
  if (irishEtfs[ticker]) return irishEtfs[ticker];

  if (ticker.includes(".")) return ticker;
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

    // Detect currency from Yahoo response
    let currency = meta.currency || "USD";

    // For crypto mapped to USD, convert to BRL
    const isCryptoUSD = ["BTC", "ETH", "SOL", "ADA", "DOT", "XRP", "BNB", "DOGE", "LTC", "AVAX", "MATIC", "LINK", "UNI"].includes(ticker);
    if (isCryptoUSD && currentPrice > 0) {
      const rate = await getExchangeRate("USD");
      return {
        ticker,
        currentPrice,
        change24h: Math.round(change24h * 100) / 100,
        previousClose,
        name: meta.shortName || meta.symbol || ticker,
        source: "yahoo",
        currency: "USD",
        currentPriceBRL: Math.round(currentPrice * rate * 100) / 100,
        exchangeRate: rate,
      };
    }

    // For .SA (Brazilian) tickers, currency is BRL
    if (yahooTicker.endsWith(".SA") || currency === "BRL") {
      return {
        ticker,
        currentPrice,
        change24h: Math.round(change24h * 100) / 100,
        previousClose,
        name: meta.shortName || meta.symbol || ticker,
        source: "yahoo",
        currency: "BRL",
        currentPriceBRL: currentPrice,
        exchangeRate: 1,
      };
    }

    // For international assets, convert to BRL
    const rate = await getExchangeRate(currency);
    // GBp (pence) special handling
    let priceInCurrency = currentPrice;
    let displayCurrency = currency;
    if (currency === "GBp") {
      priceInCurrency = currentPrice / 100;
      displayCurrency = "GBP";
    }

    const priceBRL = priceInCurrency * (currency === "GBp" ? rate * 100 : rate);

    return {
      ticker,
      currentPrice: currency === "GBp" ? priceInCurrency : currentPrice,
      change24h: Math.round(change24h * 100) / 100,
      previousClose: currency === "GBp" ? previousClose / 100 : previousClose,
      name: meta.shortName || meta.symbol || ticker,
      source: "yahoo",
      currency: displayCurrency,
      currentPriceBRL: Math.round(priceBRL * 100) / 100,
      exchangeRate: currency === "GBp" ? rate / 100 : rate,
    };
  } catch (err) {
    console.warn(`Yahoo Finance failed for ${yahooTicker}:`, err);
    return null;
  }
}

// ─── Multi-source fetch with fallback ───
async function fetchQuoteWithFallback(ticker: string): Promise<QuoteResult> {
  const brapiResult = await fetchBrapiQuote(ticker);
  if (brapiResult && brapiResult.currentPrice > 0) {
    return brapiResult;
  }

  const yahooResult = await fetchYahooQuote(ticker);
  if (yahooResult && yahooResult.currentPrice > 0) {
    return yahooResult;
  }

  return {
    ticker,
    currentPrice: 0,
    change24h: 0,
    previousClose: 0,
    name: ticker,
    source: "none",
    currency: "BRL",
    currentPriceBRL: 0,
    exchangeRate: 1,
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

    // Reset rate cache for each request batch
    for (const k of Object.keys(rateCache)) delete rateCache[k];

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
