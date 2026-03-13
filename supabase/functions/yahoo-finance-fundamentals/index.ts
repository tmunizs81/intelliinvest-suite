const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FundamentalResult {
  pe: number | null;
  pb: number | null;
  roe: number | null;
  dividendYield: number | null;
  evEbitda: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  marketCap: number | null;
  eps: number | null;
  revenue: number | null;
  ebitda: number | null;
  freeCashFlow: number | null;
  bookValue: number | null;
  beta: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  avgVolume: number | null;
  payout: number | null;
  currentRatio: number | null;
  grossMargin: number | null;
  vacancy: number | null;
  lastDividend: number | null;
  pvpa: number | null;
  patrimony: number | null;
  cotistas: number | null;
  sources: string[];
}

const EMPTY_RESULT: FundamentalResult = {
  pe: null, pb: null, roe: null, dividendYield: null, evEbitda: null,
  netMargin: null, debtToEquity: null, marketCap: null, eps: null,
  revenue: null, ebitda: null, freeCashFlow: null, bookValue: null,
  beta: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, avgVolume: null,
  payout: null, currentRatio: null, grossMargin: null,
  vacancy: null, lastDividend: null, pvpa: null, patrimony: null, cotistas: null,
  sources: [],
};

function mapToYahooTicker(ticker: string): string {
  const mappings: Record<string, string> = { BTC: "BTC-BRL", ETH: "ETH-BRL" };
  if (mappings[ticker]) return mappings[ticker];
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) return `${ticker}.SA`;
  return ticker;
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUA() { return userAgents[Math.floor(Math.random() * userAgents.length)]; }

// ─── Yahoo Finance V10 ───
async function getCrumbAndCookie(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const ua = randomUA();
    const initResp = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": ua }, redirect: "manual" });
    const setCookies = initResp.headers.get("set-cookie") || "";
    const crumbResp = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": ua, Cookie: setCookies },
    });
    if (!crumbResp.ok) return null;
    const crumb = await crumbResp.text();
    if (!crumb || crumb.includes("<")) return null;
    return { crumb, cookie: setCookies };
  } catch (error) {
    console.error("Failed to get Yahoo crumb:", error);
    return null;
  }
}

async function tryYahooV10(yahooTicker: string, auth: { crumb: string; cookie: string } | null): Promise<Partial<FundamentalResult> | null> {
  try {
    const modules = "summaryDetail,defaultKeyStatistics,financialData,price";
    const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooTicker}?modules=${modules}${crumbParam}`;
    const headers: Record<string, string> = { "User-Agent": randomUA() };
    if (auth?.cookie) headers.Cookie = auth.cookie;

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;

    const data = await resp.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;

    const getRaw = (obj: any) => {
      if (obj == null) return null;
      if (typeof obj === "number") return obj;
      return obj?.raw ?? obj?.rawValue ?? null;
    };

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
      grossMargin: getRaw(financial.grossMargins) != null ? getRaw(financial.grossMargins) * 100 : null,
      dividendYield: getRaw(summary.dividendYield) != null
        ? getRaw(summary.dividendYield) * 100
        : getRaw(summary.trailingAnnualDividendYield) != null
          ? getRaw(summary.trailingAnnualDividendYield) * 100
          : null,
      debtToEquity: getRaw(financial.debtToEquity) != null ? getRaw(financial.debtToEquity) / 100 : null,
      currentRatio: getRaw(financial.currentRatio),
      marketCap: getRaw(price.marketCap),
      revenue: getRaw(financial.totalRevenue),
      ebitda: getRaw(financial.ebitda),
      freeCashFlow: getRaw(financial.freeCashflow),
      fiftyTwoWeekHigh: getRaw(summary.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: getRaw(summary.fiftyTwoWeekLow),
      beta: getRaw(keyStats.beta) ?? getRaw(summary.beta),
      avgVolume: getRaw(summary.averageDailyVolume10Day) ?? getRaw(price.averageDailyVolume10Day),
      payout: getRaw(keyStats.payoutRatio) != null ? getRaw(keyStats.payoutRatio) * 100 : null,
    };
  } catch (error) {
    console.error("tryYahooV10 error:", error);
    return null;
  }
}

async function tryYahooChart(yahooTicker: string): Promise<Partial<FundamentalResult> | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=5d&includePrePost=false`;
    const resp = await fetch(url, { headers: { "User-Agent": randomUA() }, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return { fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null, fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null };
  } catch (error) {
    console.error("tryYahooChart error:", error);
    return null;
  }
}

// ─── Brapi API (primary source for Brazilian assets) ───
async function tryBrapi(ticker: string): Promise<Partial<FundamentalResult> | null> {
  const token = Deno.env.get("BRAPI_TOKEN");
  if (!token) return null;
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?fundamental=true&modules=financialData&token=${token}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const r = data?.results?.[0];
    if (!r) return null;

    const getRaw = (obj: any) => {
      if (obj == null) return null;
      if (typeof obj === "number") return obj;
      return obj?.raw ?? obj?.rawValue ?? null;
    };

    const fin = r.financialData || {};

    const result: Partial<FundamentalResult> = {
      pe: r.priceEarnings ?? null,
      eps: r.earningsPerShare ?? null,
      dividendYield: r.dividendYield != null ? r.dividendYield * 100 : null,
      marketCap: r.marketCap ?? null,
      fiftyTwoWeekHigh: r.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: r.fiftyTwoWeekLow ?? null,
      avgVolume: r.averageDailyVolume10Day ?? null,
      beta: r.beta ?? null,
      // financialData module
      roe: getRaw(fin.returnOnEquity) != null ? getRaw(fin.returnOnEquity) * 100 : null,
      netMargin: getRaw(fin.profitMargins) != null ? getRaw(fin.profitMargins) * 100 : null,
      grossMargin: getRaw(fin.grossMargins) != null ? getRaw(fin.grossMargins) * 100 : null,
      revenue: getRaw(fin.totalRevenue),
      ebitda: getRaw(fin.ebitda),
      freeCashFlow: getRaw(fin.freeCashflow),
      debtToEquity: getRaw(fin.debtToEquity) != null ? getRaw(fin.debtToEquity) / 100 : null,
      currentRatio: getRaw(fin.currentRatio),
      evEbitda: getRaw(fin.enterpriseToEbitda),
      payout: getRaw(fin.payoutRatio) != null ? getRaw(fin.payoutRatio) * 100 : null,
    };

    // P/VP
    if (r.regularMarketPrice && r.bookValue) {
      result.pb = r.regularMarketPrice / r.bookValue;
      result.bookValue = r.bookValue;
    }

    return Object.values(result).some(v => v != null) ? result : null;
  } catch (e) {
    console.warn("Brapi error:", e);
    return null;
  }
}

function mergeData(...sources: Array<Partial<FundamentalResult> | null>): FundamentalResult {
  const result: FundamentalResult = { ...EMPTY_RESULT };
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (key === 'sources') continue;
      const typedKey = key as keyof FundamentalResult;
      if (result[typedKey] == null && value != null) {
        result[typedKey] = value as never;
      }
    }
  }
  return result;
}

function getAssetCategory(ticker: string, type?: string): 'fii' | 'stock' | 'etf' | 'bdr' | 'other' {
  if (type === 'FII') return 'fii';
  if (type === 'ETF') return 'etf';
  if (type === 'BDR') return 'bdr';
  const t = ticker.toUpperCase();
  if (/^[A-Z]{4}11$/.test(t)) return 'fii';
  if (/^[A-Z]{4}(34|35|39)$/.test(t)) return 'bdr';
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return 'stock';
  return 'other';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, type } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yahooTicker = mapToYahooTicker(ticker);
    const category = getAssetCategory(ticker, type);
    const isBrazilian = /^[A-Z]{4}\d{1,2}$/i.test(ticker);

    console.log(`Fetching fundamentals for ${ticker} → ${yahooTicker} (category: ${category})`);

    const activeSources: string[] = [];

    // Parallel: Brapi (for BR) + Yahoo V10 + Yahoo Chart
    const [brapiData, auth] = await Promise.all([
      isBrazilian ? tryBrapi(ticker) : Promise.resolve(null),
      getCrumbAndCookie(),
    ]);

    if (brapiData) activeSources.push("Brapi");

    const [yahooV10, yahooChart] = await Promise.all([
      tryYahooV10(yahooTicker, auth),
      tryYahooChart(yahooTicker),
    ]);

    if (yahooV10) activeSources.push("Yahoo Finance");
    if (yahooChart) activeSources.push("Yahoo Chart");

    // For Brazilian: Brapi first, Yahoo as fallback
    // For international: Yahoo only
    const result = isBrazilian
      ? mergeData(brapiData, yahooV10, yahooChart)
      : mergeData(yahooV10, yahooChart);

    result.sources = activeSources;

    console.log(`Sources for ${ticker}: ${activeSources.join(", ")}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("yahoo-finance-fundamentals error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
