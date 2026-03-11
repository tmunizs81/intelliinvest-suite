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
  };
  if (mappings[ticker]) return mappings[ticker];
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) return `${ticker}.SA`;
  return ticker;
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function randomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

const getRaw = (obj: any) => obj?.raw ?? obj?.rawValue ?? null;

async function fetchWithRetry(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": randomUA() },
      });
      if (resp.ok) return resp;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    } catch {
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  return new Response(null, { status: 500 });
}

// Strategy 1: Yahoo v10 quoteSummary
async function tryV10(yahooTicker: string): Promise<any | null> {
  const modules = "summaryDetail,defaultKeyStatistics,financialData,price";
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooTicker}?modules=${modules}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const result = data.quoteSummary?.result?.[0];
  if (!result) return null;

  const summary = result.summaryDetail || {};
  const keyStats = result.defaultKeyStatistics || {};
  const financial = result.financialData || {};
  const price = result.price || {};

  return {
    pe: getRaw(summary.trailingPE) ?? getRaw(keyStats.trailingPE),
    pb: getRaw(keyStats.priceToBook) ?? getRaw(summary.priceToBook),
    evEbitda: getRaw(keyStats.enterpriseToEbitda),
    eps: getRaw(keyStats.trailingEps),
    bookValue: getRaw(keyStats.bookValue),
    roe: getRaw(financial.returnOnEquity) != null ? getRaw(financial.returnOnEquity) * 100 : null,
    netMargin: getRaw(financial.profitMargins) != null ? getRaw(financial.profitMargins) * 100 : null,
    dividendYield: getRaw(summary.dividendYield) != null
      ? getRaw(summary.dividendYield) * 100
      : getRaw(summary.trailingAnnualDividendYield) != null
        ? getRaw(summary.trailingAnnualDividendYield) * 100
        : null,
    debtToEquity: getRaw(financial.debtToEquity) != null ? getRaw(financial.debtToEquity) / 100 : null,
    marketCap: getRaw(price.marketCap),
    revenue: getRaw(financial.totalRevenue),
    ebitda: getRaw(financial.ebitda),
    freeCashFlow: getRaw(financial.freeCashflow),
    fiftyTwoWeekHigh: getRaw(summary.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: getRaw(summary.fiftyTwoWeekLow),
    beta: getRaw(keyStats.beta) ?? getRaw(summary.beta),
    avgVolume: getRaw(summary.averageDailyVolume10Day) ?? getRaw(price.averageDailyVolume10Day),
  };
}

// Strategy 2: Yahoo v6 quote API (lighter, more reliable)
async function tryV6(yahooTicker: string): Promise<any | null> {
  const url = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${yahooTicker}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const q = data.quoteResponse?.result?.[0];
  if (!q) return null;

  return {
    pe: q.trailingPE ?? null,
    pb: q.priceToBook ?? null,
    evEbitda: null,
    eps: q.trailingEps ?? q.epsTrailingTwelveMonths ?? null,
    bookValue: q.bookValue ?? null,
    roe: null,
    netMargin: null,
    dividendYield: q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : null,
    debtToEquity: null,
    marketCap: q.marketCap ?? null,
    revenue: null,
    ebitda: null,
    freeCashFlow: null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    beta: null,
    avgVolume: q.averageDailyVolume10Day ?? null,
  };
}

// Strategy 3: Yahoo v7 quote API
async function tryV7(yahooTicker: string): Promise<any | null> {
  const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${yahooTicker}`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const q = data.quoteResponse?.result?.[0];
  if (!q) return null;

  return {
    pe: q.trailingPE ?? null,
    pb: q.priceToBook ?? null,
    evEbitda: null,
    eps: q.epsTrailingTwelveMonths ?? null,
    bookValue: q.bookValue ?? null,
    roe: null,
    netMargin: null,
    dividendYield: q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : null,
    debtToEquity: null,
    marketCap: q.marketCap ?? null,
    revenue: null,
    ebitda: null,
    freeCashFlow: null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    beta: null,
    avgVolume: q.averageDailyVolume10Day ?? null,
  };
}

// Strategy 4: v8 chart API (basic fallback)
async function tryChart(yahooTicker: string): Promise<any | null> {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=5d&includePrePost=false`;
  const resp = await fetchWithRetry(url);
  if (!resp.ok) return null;
  const data = await resp.json();
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta) return null;

  return {
    pe: null, pb: null, evEbitda: null, eps: null, bookValue: null,
    roe: null, netMargin: null, dividendYield: null, debtToEquity: null,
    marketCap: null, revenue: null, ebitda: null, freeCashFlow: null,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    beta: null,
    avgVolume: null,
  };
}

// Merge: prefer non-null values from primary, fill gaps from secondary
function mergeData(primary: any, secondary: any): any {
  if (!primary) return secondary;
  if (!secondary) return primary;
  const merged = { ...primary };
  for (const key of Object.keys(secondary)) {
    if (merged[key] == null && secondary[key] != null) {
      merged[key] = secondary[key];
    }
  }
  return merged;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, type } = await req.json();
    if (!ticker) {
      return new Response(
        JSON.stringify({ error: "ticker required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const yahooTicker = mapToYahooTicker(ticker);
    console.log(`Fetching fundamentals for ${ticker} → ${yahooTicker}`);

    // Try strategies in parallel for speed
    const [v10Result, v7Result, chartResult] = await Promise.allSettled([
      tryV10(yahooTicker),
      tryV7(yahooTicker),
      tryChart(yahooTicker),
    ]);

    const v10 = v10Result.status === 'fulfilled' ? v10Result.value : null;
    const v7 = v7Result.status === 'fulfilled' ? v7Result.value : null;
    const chart = chartResult.status === 'fulfilled' ? chartResult.value : null;

    let result = mergeData(v10, v7);
    result = mergeData(result, chart);

    // If still no data, try v6 as last resort
    if (!result || Object.values(result).every(v => v == null)) {
      const v6 = await tryV6(yahooTicker);
      result = mergeData(result, v6);
    }

    if (!result) {
      result = {
        pe: null, pb: null, evEbitda: null, eps: null, bookValue: null,
        roe: null, netMargin: null, dividendYield: null, debtToEquity: null,
        marketCap: null, revenue: null, ebitda: null, freeCashFlow: null,
        fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, beta: null, avgVolume: null,
      };
    }

    console.log(`Fundamentals result for ${ticker}:`, JSON.stringify(result));

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("yahoo-finance-fundamentals error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
