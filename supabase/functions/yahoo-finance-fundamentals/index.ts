

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
  // New fields from extra sources
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

function decodeHtmlEntities(text: string) {
  return text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
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
  if (cleaned.includes(",") && cleaned.includes(".")) return Number(cleaned.replace(/\./g, "").replace(",", "."));
  if (cleaned.includes(",")) return Number(cleaned.replace(",", "."));
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
      signal: AbortSignal.timeout(10000),
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
    const resp = await fetch(url, { headers: { "User-Agent": randomUA() } });
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

// ─── StatusInvest scraping for STOCKS ───
function parseStatusInvestStock(text: string): Partial<FundamentalResult> | null {
  const pe = parseFirst(text, /P\/?L\s*([\d.,]+)/i);
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)/i);
  const dividendYield = parseFirst(text, /Dividend Yield\s*([\d.,]+)\s*%/i) ?? parseFirst(text, /D\.Y\.\s*([\d.,]+)\s*%/i);
  const roe = parseFirst(text, /ROE\s*([\d.,]+)\s*%/i);
  const netMargin = parseFirst(text, /Margem L[ií]quida\s*([\d.,]+)\s*%/i) ?? parseFirst(text, /M\.\s*L[ií]quida\s*([\d.,]+)\s*%/i);
  const grossMargin = parseFirst(text, /Margem Bruta\s*([\d.,]+)\s*%/i);
  const evEbitda = parseFirst(text, /EV\/?EBITDA?\s*([\d.,]+)/i);
  const eps = parseFirst(text, /LPA\s*R?\$?\s*([\d.,]+)/i);
  const payout = parseFirst(text, /Payout\s*([\d.,]+)\s*%/i);
  const debtToEquity = parseFirst(text, /D[ií]v\.\s*L[ií]q\.\s*\/\s*PL\s*([\d.,]+)/i);
  const currentRatio = parseFirst(text, /Liquidez Corrente\s*([\d.,]+)/i);
  const low52 = parseFirst(text, /Min\.\s*52\s*semanas?\s*R\$\s*([\d.,]+)/i);
  const high52 = parseFirst(text, /M[aá]x\.\s*52\s*semanas?\s*R\$\s*([\d.,]+)/i);
  const marketCap = parseMoneyMagnitude(text.match(/Valor de mercado\s*R\$\s*([\d.,]+(?:\s*[KMB])?)/i)?.[0] ?? null);

  const result: Partial<FundamentalResult> = {
    pe, pb, dividendYield, roe, netMargin, grossMargin, evEbitda, eps,
    payout, debtToEquity, currentRatio, marketCap,
    fiftyTwoWeekHigh: high52, fiftyTwoWeekLow: low52,
  };

  return Object.values(result).some(v => v != null) ? result : null;
}

// ─── Investidor10 scraping for STOCKS ───
function parseInvestidor10Stock(text: string): Partial<FundamentalResult> | null {
  const pe = parseFirst(text, /P\/?L\s*([\d.,]+)/i);
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)/i);
  const dividendYield = parseFirst(text, /DY\s*\(?\d*M?\)?\s*([\d.,]+)\s*%/i);
  const roe = parseFirst(text, /ROE\s*([\d.,]+)\s*%/i);
  const netMargin = parseFirst(text, /Margem L[ií]quida\s*-?\s*([\d.,]+)\s*%/i);
  const evEbitda = parseFirst(text, /EV\/?EBITDA?\s*([\d.,]+)/i);
  const payout = parseFirst(text, /Payout\s*([\d.,]+)\s*%/i);

  const result: Partial<FundamentalResult> = { pe, pb, dividendYield, roe, netMargin, evEbitda, payout };
  return Object.values(result).some(v => v != null) ? result : null;
}

// ─── StatusInvest/Investidor10 scraping for FIIs ───
function parseInvestidor10Fii(text: string, ticker: string): Partial<FundamentalResult> | null {
  const upperTicker = ticker.toUpperCase();
  const currentPrice = parseFirst(text, new RegExp(`${upperTicker}\\s+Cotação\\s+R\\$\\s*([\\d.,]+)`, "i"));
  const dividendYield = parseFirst(text, new RegExp(`${upperTicker}\\s+DY\\s*\\(12M\\)\\s*([\\d.,]+)%`, "i"));
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)/i);
  const avgVolumeValue = text.match(/Liquidez Di[aá]ria\s*R\$\s*([\d.,]+\s*[KMB]|[\d.,]+)/i)?.[1] ?? null;
  const avgVolume = parseMoneyMagnitude(avgVolumeValue ? `R$ ${avgVolumeValue}` : null);
  const result: Partial<FundamentalResult> = { dividendYield, pb, avgVolume };
  if (currentPrice != null && pb != null && pb > 0) result.bookValue = currentPrice / pb;
  return Object.values(result).some(v => v != null) ? result : null;
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
  const vacancy = parseFirst(text, /Vac[aâ]ncia\s*([\d.,]+)\s*%/i);
  const lastDividend = parseFirst(text, /[Úú]ltimo rendimento\s*R\$\s*([\d.,]+)/i);
  const cotistas = parseFirst(text, /Cotistas\s*([\d.,]+)/i);
  const result: Partial<FundamentalResult> = {
    pb, dividendYield, bookValue, marketCap,
    fiftyTwoWeekHigh: high52, fiftyTwoWeekLow: low52,
    vacancy, lastDividend, patrimony, cotistas,
  };
  return Object.values(result).some(v => v != null) ? result : null;
}

// ─── FundsExplorer scraping for FIIs ───
function parseFundsExplorer(text: string): Partial<FundamentalResult> | null {
  const dividendYield = parseFirst(text, /Dividend Yield\s*([\d.,]+)\s*%/i);
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)/i);
  const vacancy = parseFirst(text, /Vac[aâ]ncia\s*F[ií]sica\s*([\d.,]+)\s*%/i) ?? parseFirst(text, /Vac[aâ]ncia\s*([\d.,]+)\s*%/i);
  const lastDividend = parseFirst(text, /[Úú]ltimo Rendimento\s*R\$\s*([\d.,]+)/i);
  const patrimony = parseMoneyMagnitude(text.match(/Patrim[oô]nio L[ií]quido\s*R\$\s*([\d.,]+(?:\s*[KMB])?)/i)?.[0] ?? null);
  const cotistas = parseFirst(text, /N[úu]mero de Cotistas\s*([\d.,]+)/i);
  const bookValue = parseFirst(text, /Valor Patrimonial\s*R\$\s*([\d.,]+)/i);
  const marketCap = parseMoneyMagnitude(text.match(/Valor de Mercado\s*R\$\s*([\d.,]+(?:\s*[KMB])?)/i)?.[0] ?? null);

  const result: Partial<FundamentalResult> = {
    dividendYield, pb, vacancy, lastDividend, patrimony, cotistas, bookValue, marketCap,
  };
  return Object.values(result).some(v => v != null) ? result : null;
}

// ─── FIIs.com.br scraping for FIIs ───
function parseFiisCombr(text: string): Partial<FundamentalResult> | null {
  const dividendYield = parseFirst(text, /Dividend Yield\s*(?:\(12[Mm]\))?\s*([\d.,]+)\s*%/i);
  const pb = parseFirst(text, /P\/?VP\s*([\d.,]+)/i);
  const lastDividend = parseFirst(text, /[Úú]ltimo Rendimento\s*R\$\s*([\d.,]+)/i) ?? parseFirst(text, /Rendimento\s*R\$\s*([\d.,]+)/i);
  const vacancy = parseFirst(text, /Vac[aâ]ncia\s*([\d.,]+)\s*%/i);
  const patrimony = parseMoneyMagnitude(text.match(/Patrim[oô]nio\s*R\$\s*([\d.,]+(?:\s*[KMB])?)/i)?.[0] ?? null);

  const result: Partial<FundamentalResult> = { dividendYield, pb, lastDividend, vacancy, patrimony };
  return Object.values(result).some(v => v != null) ? result : null;
}

// ─── Google Finance scraping ───
function parseGoogleFinance(text: string): Partial<FundamentalResult> | null {
  const pe = parseFirst(text, /P\/E ratio\s*([\d.,]+)/i) ?? parseFirst(text, /Rela[çc][aã]o P\/?L\s*([\d.,]+)/i);
  const dividendYield = parseFirst(text, /Dividend yield\s*([\d.,]+)\s*%/i);
  const marketCap = parseMoneyMagnitude(text.match(/Market cap\s*R\$\s*([\d.,]+(?:\s*[KMBT])?)/i)?.[0] ?? null)
    ?? parseMoneyMagnitude(text.match(/Cap\.\s*de mercado\s*R\$\s*([\d.,]+(?:\s*[KMBT])?)/i)?.[0] ?? null);
  const high52 = parseFirst(text, /52[\s-]*wk high\s*R?\$?\s*([\d.,]+)/i) ?? parseFirst(text, /M[aá]x\.\s*52\s*sem\s*R?\$?\s*([\d.,]+)/i);
  const low52 = parseFirst(text, /52[\s-]*wk low\s*R?\$?\s*([\d.,]+)/i) ?? parseFirst(text, /M[ií]n\.\s*52\s*sem\s*R?\$?\s*([\d.,]+)/i);
  const avgVolume = parseFirst(text, /Avg\.?\s*Volume\s*([\d.,]+)/i) ?? parseFirst(text, /Vol\.?\s*m[eé]dio\s*([\d.,]+)/i);
  const beta = parseFirst(text, /Beta\s*([\d.,]+)/i);
  const eps = parseFirst(text, /EPS\s*\(?TTM\)?\s*R?\$?\s*([\d.,]+)/i);

  const result: Partial<FundamentalResult> = {
    pe, dividendYield, marketCap, fiftyTwoWeekHigh: high52, fiftyTwoWeekLow: low52,
    avgVolume, beta, eps,
  };
  return Object.values(result).some(v => v != null) ? result : null;
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

function getGoogleFinanceTicker(ticker: string, category: string): string {
  if (category === 'other') return ticker;
  return `${ticker}:BVMF`;
}

serve(async (req) => {
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

    const auth = await getCrumbAndCookie();
    const t = ticker.toLowerCase();

    // Build parallel fetch promises based on asset type
    const fetches: Promise<any>[] = [
      tryYahooV10(yahooTicker, auth),
      tryYahooChart(yahooTicker),
    ];

    // Google Finance for all Brazilian assets
    if (isBrazilian) {
      const gfTicker = getGoogleFinanceTicker(ticker.toUpperCase(), category);
      fetches.push(fetchHtml(`https://www.google.com/finance/quote/${gfTicker}`));
    } else {
      fetches.push(Promise.resolve(null));
    }

    if (category === 'fii') {
      fetches.push(fetchHtml(`https://investidor10.com.br/fiis/${t}/`));
      fetches.push(fetchHtml(`https://statusinvest.com.br/fundos-imobiliarios/${t}`));
      fetches.push(fetchHtml(`https://www.fundsexplorer.com.br/funds/${t}`));
      fetches.push(fetchHtml(`https://fiis.com.br/${t}/`));
      fetches.push(Promise.resolve(null)); // stock statusinvest
      fetches.push(Promise.resolve(null)); // stock investidor10
    } else if (category === 'stock' && isBrazilian) {
      fetches.push(Promise.resolve(null)); // fii investidor10
      fetches.push(Promise.resolve(null)); // fii statusinvest
      fetches.push(Promise.resolve(null)); // fundsexplorer
      fetches.push(Promise.resolve(null)); // fiis.com.br
      fetches.push(fetchHtml(`https://statusinvest.com.br/acoes/${t}`));
      fetches.push(fetchHtml(`https://investidor10.com.br/acoes/${t}/`));
    } else if (category === 'etf' && isBrazilian) {
      fetches.push(Promise.resolve(null));
      fetches.push(Promise.resolve(null));
      fetches.push(Promise.resolve(null));
      fetches.push(Promise.resolve(null));
      fetches.push(fetchHtml(`https://statusinvest.com.br/etfs/${t}`));
      fetches.push(Promise.resolve(null));
    } else if (category === 'bdr' && isBrazilian) {
      fetches.push(Promise.resolve(null));
      fetches.push(Promise.resolve(null));
      fetches.push(Promise.resolve(null));
      fetches.push(Promise.resolve(null));
      fetches.push(fetchHtml(`https://statusinvest.com.br/bdrs/${t}`));
      fetches.push(Promise.resolve(null));
    } else {
      fetches.push(Promise.resolve(null), Promise.resolve(null), Promise.resolve(null), Promise.resolve(null), Promise.resolve(null), Promise.resolve(null));
    }

    const [yahooV10, yahooChart, googleFinanceHtml, fiiInvestidorHtml, fiiStatusInvestHtml, fundsExplorerHtml, fiisComBrHtml, stockStatusInvestHtml, stockInvestidor10Html] = await Promise.all(fetches);

    // Track which sources returned data
    const activeSources: string[] = [];

    // Parse results
    let brazilianParsed1: Partial<FundamentalResult> | null = null;
    let brazilianParsed2: Partial<FundamentalResult> | null = null;
    let fundsExplorerParsed: Partial<FundamentalResult> | null = null;
    let fiisComBrParsed: Partial<FundamentalResult> | null = null;
    let googleFinanceParsed: Partial<FundamentalResult> | null = null;

    if (yahooV10) activeSources.push("Yahoo Finance V10");
    if (yahooChart) activeSources.push("Yahoo Chart");

    if (googleFinanceHtml) {
      googleFinanceParsed = parseGoogleFinance(stripHtmlToText(googleFinanceHtml));
      if (googleFinanceParsed) activeSources.push("Google Finance");
    }

    if (category === 'fii') {
      brazilianParsed1 = fiiStatusInvestHtml ? parseStatusInvestFii(stripHtmlToText(fiiStatusInvestHtml)) : null;
      brazilianParsed2 = fiiInvestidorHtml ? parseInvestidor10Fii(stripHtmlToText(fiiInvestidorHtml), ticker) : null;
      fundsExplorerParsed = fundsExplorerHtml ? parseFundsExplorer(stripHtmlToText(fundsExplorerHtml)) : null;
      fiisComBrParsed = fiisComBrHtml ? parseFiisCombr(stripHtmlToText(fiisComBrHtml)) : null;
      if (brazilianParsed1) activeSources.push("StatusInvest");
      if (brazilianParsed2) activeSources.push("Investidor10");
      if (fundsExplorerParsed) activeSources.push("FundsExplorer");
      if (fiisComBrParsed) activeSources.push("FIIs.com.br");
    } else if (isBrazilian) {
      brazilianParsed1 = stockStatusInvestHtml ? parseStatusInvestStock(stripHtmlToText(stockStatusInvestHtml)) : null;
      brazilianParsed2 = stockInvestidor10Html ? parseInvestidor10Stock(stripHtmlToText(stockInvestidor10Html)) : null;
      if (brazilianParsed1) activeSources.push("StatusInvest");
      if (brazilianParsed2) activeSources.push("Investidor10");
    }

    // For Brazilian assets, prioritize local sources; for international, Yahoo only
    const result = isBrazilian
      ? mergeData(brazilianParsed1, brazilianParsed2, fundsExplorerParsed, fiisComBrParsed, googleFinanceParsed, yahooV10, yahooChart)
      : mergeData(yahooV10, yahooChart, googleFinanceParsed);

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
