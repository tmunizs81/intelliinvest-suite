import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function mapToYahooTicker(ticker: string): string {
  if (/^[A-Z]{4}\d{1,2}$/.test(ticker)) return `${ticker}.SA`;
  return ticker;
}

interface DividendEvent {
  date: string;
  paymentDate: string | null;
  exDate: string | null;
  amount: number;
  ticker: string;
  label: string; // "Dividendo", "JCP", "Rendimento"
}

// ─── Source 1: Brapi (primary for BR) ───
async function fetchBrapiDividends(ticker: string): Promise<DividendEvent[] | null> {
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?dividends=true&range=5y&fundamental=false`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.results?.[0];
    if (!result?.dividendsData?.cashDividends) return null;

    const divs: DividendEvent[] = result.dividendsData.cashDividends.map((d: any) => ({
      date: d.approvedDate || d.lastDatePrior || "",
      paymentDate: d.paymentDate || null,
      exDate: d.lastDatePrior || null,
      amount: d.rate ?? d.value ?? 0,
      ticker,
      label: d.label || (d.type === "JCP" ? "JCP" : "Dividendo"),
    }));

    return divs.filter(d => d.amount > 0);
  } catch (err) {
    console.warn(`Brapi dividends failed for ${ticker}:`, err);
    return null;
  }
}

// ─── Source 2: Yahoo Finance (fallback) ───
async function fetchYahooDividends(ticker: string): Promise<DividendEvent[] | null> {
  const yahooTicker = mapToYahooTicker(ticker);
  try {
    // 5 years range
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1mo&range=5y&events=div`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const dividends = result.events?.dividends || {};
    const divs: DividendEvent[] = Object.values(dividends).map((div: any) => ({
      date: new Date(div.date * 1000).toISOString().split("T")[0],
      paymentDate: null,
      exDate: new Date(div.date * 1000).toISOString().split("T")[0],
      amount: div.amount || 0,
      ticker,
      label: "Dividendo",
    }));

    return divs.filter(d => d.amount > 0);
  } catch (err) {
    console.warn(`Yahoo dividends failed for ${yahooTicker}:`, err);
    return null;
  }
}

async function fetchDividendHistory(ticker: string): Promise<{ history: DividendEvent[]; error?: string }> {
  // Try Brapi first
  const brapiResult = await fetchBrapiDividends(ticker);
  if (brapiResult && brapiResult.length > 0) {
    brapiResult.sort((a, b) => b.date.localeCompare(a.date));
    return { history: brapiResult };
  }

  // Fallback to Yahoo
  const yahooResult = await fetchYahooDividends(ticker);
  if (yahooResult && yahooResult.length > 0) {
    yahooResult.sort((a, b) => b.date.localeCompare(a.date));
    return { history: yahooResult };
  }

  return { history: [], error: "Sem dados de dividendos" };
}

function projectDividends(
  history: DividendEvent[],
  ticker: string,
  type: string,
): DividendEvent[] {
  if (history.length === 0) return [];

  const now = new Date();
  const projected: DividendEvent[] = [];

  // Calculate average dividend from last 12 months
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const recentDivs = history.filter(d => new Date(d.date) >= oneYearAgo);
  if (recentDivs.length === 0) return [];

  const avgAmount = recentDivs.reduce((s, d) => s + d.amount, 0) / recentDivs.length;
  const isFII = type === "FII";
  const monthsBetween = isFII ? 1 : Math.max(1, Math.round(12 / recentDivs.length));

  const lastDivDate = new Date(history[0].date);
  let nextDate = new Date(lastDivDate);

  for (let i = 0; i < 24; i++) {
    nextDate = new Date(nextDate);
    nextDate.setMonth(nextDate.getMonth() + monthsBetween);
    if (nextDate <= now) continue;

    const futureDate = new Date(now);
    futureDate.setMonth(futureDate.getMonth() + 12);
    if (nextDate > futureDate) break;

    // Estimate payment date as ~15 days after ex-date
    const payDate = new Date(nextDate);
    payDate.setDate(payDate.getDate() + 15);

    projected.push({
      date: nextDate.toISOString().split("T")[0],
      paymentDate: payDate.toISOString().split("T")[0],
      exDate: nextDate.toISOString().split("T")[0],
      amount: Math.round(avgAmount * 100) / 100,
      ticker,
      label: isFII ? "Rendimento (proj.)" : "Dividendo (proj.)",
    });
  }

  return projected;
}

// ─── Yearly stats ───
function buildYearlyStats(history: DividendEvent[], quantity: number) {
  const yearMap: Record<string, { total: number; count: number; events: DividendEvent[] }> = {};

  for (const div of history) {
    const year = div.date.substring(0, 4);
    if (!yearMap[year]) yearMap[year] = { total: 0, count: 0, events: [] };
    yearMap[year].total += div.amount;
    yearMap[year].count += 1;
    yearMap[year].events.push(div);
  }

  return Object.entries(yearMap)
    .map(([year, data]) => ({
      year,
      totalPerShare: Math.round(data.total * 100) / 100,
      totalReceived: Math.round(data.total * quantity * 100) / 100,
      paymentCount: data.count,
      events: data.events.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.year.localeCompare(a.year));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { holdings } = await req.json();

    if (!Array.isArray(holdings) || holdings.length === 0) {
      return new Response(
        JSON.stringify({ error: "holdings array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eligibleTypes = ["Ação", "FII", "ETF"];
    const eligible = holdings.filter((h: any) => eligibleTypes.includes(h.type));
    const limited = eligible.slice(0, 20);

    const results = await Promise.all(
      limited.map(async (h: any) => {
        const { history, error } = await fetchDividendHistory(h.ticker);
        const projected = projectDividends(history, h.ticker, h.type);
        const yearlyStats = buildYearlyStats(history, h.quantity);

        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const totalPerShare12m = history
          .filter(d => new Date(d.date) >= oneYearAgo)
          .reduce((s, d) => s + d.amount, 0);

        const annualIncome = totalPerShare12m * h.quantity;
        const currentValue = (h.currentPrice || 0) * h.quantity;
        const yieldPct = currentValue > 0 ? (annualIncome / currentValue) * 100 : 0;

        // Next payment
        const nextPayment = projected.length > 0 ? projected[0] : null;

        // Last payment
        const lastPayment = history.length > 0 ? history[0] : null;

        // Payment consistency: % of expected months with dividends in last 2 years
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
        const recent2y = history.filter(d => new Date(d.date) >= twoYearsAgo);
        const expectedMonths = h.type === "FII" ? 24 : 8;
        const consistency = Math.min(100, Math.round((recent2y.length / expectedMonths) * 100));

        return {
          ticker: h.ticker,
          name: h.name,
          type: h.type,
          quantity: h.quantity,
          currentPrice: h.currentPrice || 0,
          history,
          projected,
          yearlyStats,
          totalPerShare12m: Math.round(totalPerShare12m * 100) / 100,
          annualIncome: Math.round(annualIncome * 100) / 100,
          yieldPct: Math.round(yieldPct * 100) / 100,
          nextPayment,
          lastPayment,
          consistency,
          error,
        };
      })
    );

    // Calendar: aggregate all projected dividends by month
    const allProjected = results.flatMap(r =>
      r.projected.map(p => ({
        ...p,
        totalAmount: Math.round(p.amount * r.quantity * 100) / 100,
        name: r.name,
        type: r.type,
      }))
    );

    const calendarMap: Record<string, { month: string; events: any[]; total: number }> = {};
    for (const p of allProjected) {
      const month = p.date.substring(0, 7);
      if (!calendarMap[month]) calendarMap[month] = { month, events: [], total: 0 };
      calendarMap[month].events.push(p);
      calendarMap[month].total += p.totalAmount;
    }
    const calendar = Object.values(calendarMap).sort((a, b) => a.month.localeCompare(b.month));

    // Upcoming payments (next 60 days)
    const now = new Date();
    const in60days = new Date(now);
    in60days.setDate(in60days.getDate() + 60);
    const upcoming = allProjected
      .filter(p => {
        const d = new Date(p.paymentDate || p.date);
        return d >= now && d <= in60days;
      })
      .sort((a, b) => (a.paymentDate || a.date).localeCompare(b.paymentDate || b.date));

    // Summary
    const totalAnnualIncome = results.reduce((s, r) => s + r.annualIncome, 0);
    const monthlyAvg = totalAnnualIncome / 12;
    const totalProjected12m = allProjected.reduce((s, p) => s + p.totalAmount, 0);

    // Total received all time
    const totalReceivedAllTime = results.reduce((s, r) => {
      return s + r.history.reduce((hs: number, h: any) => hs + h.amount * r.quantity, 0);
    }, 0);

    // Yield on cost (based on avg_price from holdings)
    const totalCost = limited.reduce((s, h: any) => s + (h.avg_price || h.avgPrice || 0) * h.quantity, 0);
    const yieldOnCost = totalCost > 0 ? (totalAnnualIncome / totalCost) * 100 : 0;

    return new Response(
      JSON.stringify({
        assets: results,
        calendar,
        upcoming,
        summary: {
          totalAnnualIncome: Math.round(totalAnnualIncome * 100) / 100,
          monthlyAverage: Math.round(monthlyAvg * 100) / 100,
          totalProjected12m: Math.round(totalProjected12m * 100) / 100,
          totalReceivedAllTime: Math.round(totalReceivedAllTime * 100) / 100,
          assetsWithDividends: results.filter(r => r.history.length > 0).length,
          yieldOnCost: Math.round(yieldOnCost * 100) / 100,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("dividends error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
