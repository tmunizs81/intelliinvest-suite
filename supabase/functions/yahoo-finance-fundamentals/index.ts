import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
}

const EMPTY_RESULT: FundamentalResult = {
  pe: null,
  pb: null,
  roe: null,
  dividendYield: null,
  evEbitda: null,
  netMargin: null,
  debtToEquity: null,
  marketCap: null,
  eps: null,
  revenue: null,
  ebitda: null,
  freeCashFlow: null,
  bookValue: null,
  beta: null,
  fiftyTwoWeekHigh: null,
  fiftyTwoWeekLow: null,
  avgVolume: null,
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

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtmlToText(html: string) {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocaleNumber(value?: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;

  if (cleaned.includes(",") && cleaned.includes(".")) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  if (cleaned.includes(",")) {
    return Number(cleaned.replace(",", "."));
  }

  return Number(cleaned);
}

function parseMoneyMagnitude(value?: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  const match = normalized.match(/R\$\s*([\d.,]+)\s*([KMB]|Mil|Mi|Bi)?/i);
  if (!match) return null;

  const base = parseLocaleNumber(match[1]);
  if (base == null || Number.isNaN(base)) return null;

  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K" || suffix === "MIL") return base * 1e3;
  if (suffix === "M" || suffix === "MI") return base * 1e6;
  if (suffix === "B" || suffix === "BI") return base * 1e9;
  return base;
}

function parseFirst(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  return parseLocaleNumber(match?.[1] ?? null);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
    });

    if (!resp.ok) return null;
    return await resp.text();
  } catch (error) {
    console.error(`fetchHtml error for ${url}:`, error);
    return null;
  }
}

async function getCrumbAndCookie(): Promise<{ crumb: string; cookie: string } | null> {
  try {
    const ua = randomUA();
    const initResp = await fetch("https://fc.yahoo.com/", {
      headers: { "User-Agent": ua },
      redirect: "manual",
    });

    const setCookies = initResp.headers.get("set-cookie") || "";
    const crumbResp = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": ua,
        Cookie: setCookies,
      },
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

    const resp = await fetch(url, { headers });
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
  } catch (error) {
    console.error("tryYahooV10 error:", error);
    return null;
  }
}

async function tryYahooChart(yahooTicker: string): Promise<Partial<FundamentalResult> | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=5d&includePrePost=false`;
    const resp = await fetch(url, { headers: { "User-Agent": randomUA() } });
    if (!resp.ok) return null;

    const data = await resp.json();
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) return null;

    return {
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
    };
  } catch (error) {
    console.error("tryYahooChart error:", error);
    return null;
  }
}

function parseInvestidor10Fii(text: string, ticker: string): Partial<FundamentalResult> | null {
  const upperTicker = ticker.toUpperCase();
  const currentPrice = parseFirst(text, new RegExp(`${upperTicker}\\s+Cotação\\s+R\\$\\s*([\\d.,]+)`, "i"));
  const dividendYield = parseFirst(text, new RegExp(`${upperTicker}\\s+DY\\s*\\(12M\\)\\s*([\\d.,]+)%`, "i"));
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)/i);
  const avgVolumeValue = text.match(/Liquidez Di[aá]ria\s*R\$\s*([\d.,]+\s*[KMB]|[\d.,]+)/i)?.[1] ?? null;
  const avgVolume = parseMoneyMagnitude(avgVolumeValue ? `R$ ${avgVolumeValue}` : null);

  const result: Partial<FundamentalResult> = {
    dividendYield,
    pb,
    avgVolume,
  };

  if (currentPrice != null && pb != null && pb > 0) {
    result.bookValue = currentPrice / pb;
  }

  return Object.values(result).some((value) => value != null) ? result : null;
}

function parseStatusInvestFii(text: string): Partial<FundamentalResult> | null {
  const currentPrice = parseFirst(text, /Valor atual\s*R\$\s*([\d.,]+)/i);
  const low52 = parseFirst(text, /Min\.\s*52\s*semanas\s*R\$\s*([\d.,]+)/i);
  const high52 = parseFirst(text, /M[aá]x\.\s*52\s*semanas\s*R\$\s*([\d.,]+)/i);
  const dividendYield = parseFirst(text, /Dividend Yield\s*([\d.,]+)\s*%/i);
  const bookValue = parseFirst(text, /Val\.\s*patrimonial\s*p\/?cota\s*Valor patrimonial\s*p\/?cota\s*R\$\s*([\d.,]+)/i);
  const patrimony = parseMoneyMagnitude(text.match(/Patrim[oô]nio\s*R\$\s*([\d.,]+(?:\s*[KMB])?)/i)?.[0] ?? null);
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)\s*Valor de mercado/i) ?? (currentPrice != null && bookValue != null && bookValue > 0 ? currentPrice / bookValue : null);
  const marketCapFromText = parseMoneyMagnitude(text.match(/Valor de mercado\s*R\$\s*([\d.,]+(?:\s*[KMB])?)/i)?.[0] ?? null);
  const marketCap = marketCapFromText ?? (patrimony != null && pb != null ? patrimony * pb : null);

  const result: Partial<FundamentalResult> = {
    pb,
    dividendYield,
    bookValue,
    marketCap,
    fiftyTwoWeekHigh: high52,
    fiftyTwoWeekLow: low52,
  };

  return Object.values(result).some((value) => value != null) ? result : null;
}

function mergeData(...sources: Array<Partial<FundamentalResult> | null>): FundamentalResult {
  const result: FundamentalResult = { ...EMPTY_RESULT };

  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      const typedKey = key as keyof FundamentalResult;
      if (result[typedKey] == null && value != null) {
        result[typedKey] = value as never;
      }
    }
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, type } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const yahooTicker = mapToYahooTicker(ticker);
    const isFii = type === "FII" && /^[A-Z]{4}\d{1,2}$/i.test(ticker);

    console.log(`Fetching fundamentals for ${ticker} → ${yahooTicker} (FII: ${isFii})`);

    const auth = await getCrumbAndCookie();

    const [yahooV10, yahooChart, investidorHtml, statusInvestHtml] = await Promise.all([
      tryYahooV10(yahooTicker, auth),
      tryYahooChart(yahooTicker),
      isFii ? fetchHtml(`https://investidor10.com.br/fiis/${ticker.toLowerCase()}/`) : Promise.resolve(null),
      isFii ? fetchHtml(`https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`) : Promise.resolve(null),
    ]);

    const investidorParsed = investidorHtml ? parseInvestidor10Fii(stripHtmlToText(investidorHtml), ticker) : null;
    const statusInvestParsed = statusInvestHtml ? parseStatusInvestFii(stripHtmlToText(statusInvestHtml)) : null;

    const result = isFii
      ? mergeData(statusInvestParsed, investidorParsed, yahooV10, yahooChart)
      : mergeData(yahooV10, yahooChart);

    console.log(`Parsed sources for ${ticker}:`, JSON.stringify({
      yahooV10: !!yahooV10,
      yahooChart: !!yahooChart,
      investidorParsed,
      statusInvestParsed,
    }));
    console.log(`Fundamentals result for ${ticker}: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("yahoo-finance-fundamentals error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
