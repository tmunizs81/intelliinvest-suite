import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface ScreenerFilter {
  type: 'stock' | 'fii';
  minDY?: number;
  maxPL?: number;
  minROE?: number;
  maxPVP?: number;
  minMarketCap?: number; // in billions BRL
  sector?: string;
  limit?: number;
}

interface ScreenerResult {
  ticker: string;
  name: string;
  price: number;
  dy: number;
  pl: number;
  pvp: number;
  roe: number;
  marketCap: number;
  sector: string;
  score: number;
}

const CACHE = new Map<string, { data: ScreenerResult[]; at: number }>();
const TTL = 30 * 60 * 1000; // 30 min

async function fetchBrapiList(type: 'stock' | 'fii', token: string): Promise<any[]> {
  const cacheKey = `list_${type}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL) return cached.data as any;

  const url = type === 'fii'
    ? `https://brapi.dev/api/quote/list?sortBy=volume&sortOrder=desc&limit=100&type=fund&token=${token}`
    : `https://brapi.dev/api/quote/list?sortBy=volume&sortOrder=desc&limit=100&token=${token}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Brapi list failed: ${resp.status}`);
  const data = await resp.json();
  const stocks = data.stocks || [];
  CACHE.set(cacheKey, { data: stocks, at: Date.now() });
  return stocks;
}

async function enrichTicker(ticker: string, token: string): Promise<ScreenerResult | null> {
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?modules=defaultKeyStatistics,financialData,summaryProfile&fundamental=true&dividends=true&token=${token}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const q = data.results?.[0];
    if (!q) return null;

    const keyStats = q.defaultKeyStatistics || {};
    const financial = q.financialData || {};
    const profile = q.summaryProfile || {};

    const dividendsPaid12m = (q.dividendsData?.cashDividends || [])
      .filter((d: any) => new Date(d.paymentDate || d.assetIssued) > new Date(Date.now() - 365 * 86400000))
      .reduce((sum: number, d: any) => sum + (d.rate || 0), 0);

    const price = q.regularMarketPrice || 0;
    const dy = price > 0 ? (dividendsPaid12m / price) * 100 : 0;

    return {
      ticker: q.symbol,
      name: q.longName || q.shortName || ticker,
      price,
      dy,
      pl: q.priceEarnings || 0,
      pvp: keyStats.priceToBook || 0,
      roe: (financial.returnOnEquity || 0) * 100,
      marketCap: (q.marketCap || 0) / 1e9,
      sector: profile.sector || profile.industry || 'N/A',
      score: 0,
    };
  } catch {
    return null;
  }
}

function computeScore(r: ScreenerResult, type: 'stock' | 'fii'): number {
  let s = 0;
  if (type === 'fii') {
    // FIIs: DY peso 50%, P/VP < 1.05 peso 30%, liquidez 20%
    s += Math.min(r.dy / 12, 1) * 50;
    s += r.pvp > 0 && r.pvp <= 1.05 ? 30 : Math.max(0, 30 - (r.pvp - 1.05) * 30);
    s += Math.min(r.marketCap / 5, 1) * 20;
  } else {
    // Ações: ROE 30%, P/L 25%, DY 25%, P/VP 20%
    s += Math.min(r.roe / 20, 1) * 30;
    s += r.pl > 0 && r.pl <= 15 ? 25 : Math.max(0, 25 - (r.pl - 15) * 1.5);
    s += Math.min(r.dy / 8, 1) * 25;
    s += r.pvp > 0 && r.pvp <= 2 ? 20 : Math.max(0, 20 - (r.pvp - 2) * 5);
  }
  return Math.round(s);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const token = Deno.env.get('BRAPI_TOKEN');
  if (!token) {
    return new Response(JSON.stringify({ error: 'BRAPI_TOKEN not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const filter: ScreenerFilter = await req.json();
    const type = filter.type || 'stock';

    const list = await fetchBrapiList(type, token);
    const tickers = list.slice(0, 40).map((s: any) => s.stock);

    // Enrich in batches of 8 to respect rate limits
    const results: ScreenerResult[] = [];
    for (let i = 0; i < tickers.length; i += 8) {
      const batch = tickers.slice(i, i + 8);
      const enriched = await Promise.all(batch.map((t) => enrichTicker(t, token)));
      results.push(...enriched.filter((r): r is ScreenerResult => r !== null));
    }

    // Filter
    let filtered = results.filter((r) => {
      if (filter.minDY != null && r.dy < filter.minDY) return false;
      if (filter.maxPL != null && (r.pl <= 0 || r.pl > filter.maxPL)) return false;
      if (filter.minROE != null && r.roe < filter.minROE) return false;
      if (filter.maxPVP != null && (r.pvp <= 0 || r.pvp > filter.maxPVP)) return false;
      if (filter.minMarketCap != null && r.marketCap < filter.minMarketCap) return false;
      if (filter.sector && !r.sector.toLowerCase().includes(filter.sector.toLowerCase())) return false;
      return true;
    });

    // Score + sort
    filtered = filtered.map((r) => ({ ...r, score: computeScore(r, type) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, filter.limit || 30);

    return new Response(JSON.stringify({ results: filtered, total: filtered.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('screener error:', err);
    return new Response(JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
