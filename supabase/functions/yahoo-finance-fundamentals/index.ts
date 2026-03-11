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
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Get Yahoo Finance crumb + cookie for authenticated API access
async function getCrumbAndCookie(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const ua = randomUA();
    
    // Step 1: Get consent cookie by visiting Yahoo Finance
    const initResp = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": ua },
      redirect: "manual",
    });
    
    const setCookies = initResp.headers.get("set-cookie") || "";
    
    // Step 2: Get crumb
    const crumbResp = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": ua,
        "Cookie": setCookies,
      },
    });
    
    if (!crumbResp.ok) return null;
    const crumb = await crumbResp.text();
    if (!crumb || crumb.includes("<")) return null;
    
    return { crumb, cookie: setCookies };
  } catch (e) {
    console.error("Failed to get crumb:", e);
    return null;
  }
}

// Strategy 1: Scrape from Yahoo Finance HTML page (most reliable, no auth needed)
async function tryHtmlScrape(yahooTicker: string): Promise<any | null> {
  try {
    const ua = randomUA();
    const url = `https://finance.yahoo.com/quote/${yahooTicker}/`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    
    // Extract JSON data embedded in the page
    const match = html.match(/root\.App\.main\s*=\s*(\{.*?\});\s*\n/s) 
      || html.match(/"QuoteSummaryStore":\s*(\{.*?\})\s*,\s*"[A-Z]/s);
    
    if (!match) {
      // Try finding data in newer format - look for quoteSummary in script tags
      const scriptMatch = html.match(/<script[^>]*>.*?"quoteSummary".*?<\/script>/s);
      if (scriptMatch) {
        // Try to extract individual values using regex patterns
        return extractFromHtml(html);
      }
      return extractFromHtml(html);
    }
    
    return null;
  } catch (e) {
    console.error("HTML scrape error:", e);
    return null;
  }
}

function extractFromHtml(html: string): any | null {
  const extract = (pattern: RegExp): number | null => {
    const m = html.match(pattern);
    if (m?.[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      return isNaN(val) ? null : val;
    }
    return null;
  };

  // Look for data in fin-streamer elements and data attributes
  const pe = extract(/data-field="trailingPE"[^>]*>([0-9.,]+)/) 
    ?? extract(/"trailingPE":\s*\{"raw":\s*([0-9.]+)/);
  const pb = extract(/data-field="priceToBook"[^>]*>([0-9.,]+)/)
    ?? extract(/"priceToBook":\s*\{"raw":\s*([0-9.]+)/);
  const eps = extract(/"epsTrailingTwelveMonths":\s*([0-9.]+)/)
    ?? extract(/data-field="epsTrailingTwelveMonths"[^>]*>([0-9.,]+)/);
  const bookValue = extract(/"bookValue":\s*\{"raw":\s*([0-9.]+)/)
    ?? extract(/data-field="bookValue"[^>]*>([0-9.,]+)/);
  const marketCap = extract(/"marketCap":\s*\{"raw":\s*([0-9.]+)/);
  const dividendYield = extract(/"dividendYield":\s*\{"raw":\s*([0-9.]+)/);
  const fiftyTwoWeekHigh = extract(/"fiftyTwoWeekHigh":\s*\{"raw":\s*([0-9.]+)/)
    ?? extract(/data-field="fiftyTwoWeekHigh"[^>]*>([0-9.,]+)/);
  const fiftyTwoWeekLow = extract(/"fiftyTwoWeekLow":\s*\{"raw":\s*([0-9.]+)/)
    ?? extract(/data-field="fiftyTwoWeekLow"[^>]*>([0-9.,]+)/);
  const beta = extract(/"beta":\s*\{"raw":\s*([0-9.]+)/);
  const avgVolume = extract(/"averageDailyVolume10Day":\s*\{"raw":\s*([0-9.]+)/)
    ?? extract(/data-field="averageDailyVolume10Day"[^>]*>([0-9.,]+)/);

  const hasData = [pe, pb, eps, bookValue, marketCap, dividendYield, fiftyTwoWeekHigh, fiftyTwoWeekLow].some(v => v != null);
  if (!hasData) return null;

  return {
    pe, pb, evEbitda: null, eps, bookValue,
    roe: null, netMargin: null,
    dividendYield: dividendYield != null ? dividendYield * 100 : null,
    debtToEquity: null, marketCap,
    revenue: null, ebitda: null, freeCashFlow: null,
    fiftyTwoWeekHigh, fiftyTwoWeekLow, beta, avgVolume,
  };
}

// Strategy 2: Yahoo v10 quoteSummary with crumb auth
async function tryV10(yahooTicker: string, auth: { crumb: string; cookie: string } | null): Promise<any | null> {
  const modules = "summaryDetail,defaultKeyStatistics,financialData,price";
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : "";
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooTicker}?modules=${modules}${crumbParam}`;
  
  try {
    const headers: Record<string, string> = { "User-Agent": randomUA() };
    if (auth?.cookie) headers["Cookie"] = auth.cookie;
    
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      console.log(`v10 returned ${resp.status} for ${yahooTicker}`);
      return null;
    }
    const data = await resp.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;

    const summary = result.summaryDetail || {};
    const keyStats = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    const price = result.price || {};

    const getRaw = (obj: any) => {
      if (obj == null) return null;
      if (typeof obj === "number") return obj;
      return obj?.raw ?? obj?.rawValue ?? null;
    };

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
  } catch (e) {
    console.error("v10 error:", e);
    return null;
  }
}

// Strategy 3: Yahoo v8 chart + quote combined
async function tryChart(yahooTicker: string): Promise<any | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=5d&includePrePost=false`;
    const resp = await fetch(url, { headers: { "User-Agent": randomUA() } });
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
      beta: null, avgVolume: null,
    };
  } catch {
    return null;
  }
}

// Strategy 4: Use alternative API (brapi.dev - Brazilian stocks API)
async function tryBrapi(ticker: string): Promise<any | null> {
  try {
    // brapi works with raw Brazilian tickers (no .SA suffix)
    const url = `https://brapi.dev/api/quote/${ticker}?fundamental=true`;
    const resp = await fetch(url, { headers: { "User-Agent": randomUA() } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const q = data.results?.[0];
    if (!q) return null;

    return {
      pe: q.priceEarnings ?? null,
      pb: q.priceToBookRatio ?? null,
      evEbitda: q.evToEbitda ?? null,
      eps: q.earningsPerShare ?? null,
      bookValue: q.bookValuePerShare ?? null,
      roe: q.returnOnEquity != null ? q.returnOnEquity * 100 : null,
      netMargin: q.netMargin != null ? q.netMargin * 100 : null,
      dividendYield: q.dividendYield ?? (q.dividendsPerShare != null && q.regularMarketPrice ? (q.dividendsPerShare / q.regularMarketPrice) * 100 : null),
      debtToEquity: q.debtToEquity ?? null,
      marketCap: q.marketCap ?? null,
      revenue: q.totalRevenue ?? null,
      ebitda: q.ebitda ?? null,
      freeCashFlow: q.freeCashFlow ?? null,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
      beta: q.beta ?? null,
      avgVolume: q.averageDailyVolume10Day ?? null,
    };
  } catch (e) {
    console.error("brapi error:", e);
    return null;
  }
}

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
    const isBrazilian = yahooTicker.endsWith(".SA");
    console.log(`Fetching fundamentals for ${ticker} → ${yahooTicker} (isBR: ${isBrazilian})`);

    // Get crumb for authenticated Yahoo requests
    const auth = await getCrumbAndCookie();
    console.log(`Auth crumb obtained: ${!!auth}`);

    // Run all strategies in parallel
    const strategies = [
      tryV10(yahooTicker, auth),
      tryChart(yahooTicker),
    ];
    
    // For Brazilian stocks, also try brapi as additional source
    if (isBrazilian) {
      strategies.push(tryBrapi(ticker));
    }

    const results = await Promise.allSettled(strategies);
    
    const v10 = results[0].status === "fulfilled" ? results[0].value : null;
    const chart = results[1].status === "fulfilled" ? results[1].value : null;
    const brapi = results.length > 2 && results[2].status === "fulfilled" ? results[2].value : null;

    console.log(`Results - v10: ${v10 ? "ok" : "null"}, chart: ${chart ? "ok" : "null"}, brapi: ${brapi ? "ok" : "null"}`);

    let result = mergeData(v10, chart);
    if (brapi) {
      result = mergeData(result, brapi);
    }

    // If still empty, try HTML scrape as last resort
    if (!result || Object.values(result).filter(v => v != null).length <= 2) {
      console.log("Trying HTML scrape as fallback...");
      const htmlData = await tryHtmlScrape(yahooTicker);
      result = mergeData(result, htmlData);
    }

    if (!result) {
      result = {
        pe: null, pb: null, evEbitda: null, eps: null, bookValue: null,
        roe: null, netMargin: null, dividendYield: null, debtToEquity: null,
        marketCap: null, revenue: null, ebitda: null, freeCashFlow: null,
        fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, beta: null, avgVolume: null,
      };
    }

    const nonNullCount = Object.values(result).filter(v => v != null).length;
    console.log(`Fundamentals result for ${ticker}: ${nonNullCount} non-null fields`);
    console.log(JSON.stringify(result));

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
