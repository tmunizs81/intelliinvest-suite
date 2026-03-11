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

interface DividendEvent {
  date: string;
  amount: number;
  ticker: string;
}

async function fetchDividendHistory(ticker: string): Promise<{ history: DividendEvent[]; error?: string }> {
  const yahooTicker = mapToYahooTicker(ticker);

  try {
    // Fetch 2 years of data with events=div
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1mo&range=2y&events=div`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!resp.ok) {
      console.error(`Yahoo div error for ${yahooTicker}: ${resp.status}`);
      return { history: [], error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) return { history: [], error: "No data" };

    const dividends = result.events?.dividends || {};
    const history: DividendEvent[] = Object.values(dividends).map((div: any) => ({
      date: new Date(div.date * 1000).toISOString().split("T")[0],
      amount: div.amount || 0,
      ticker,
    }));

    // Sort by date descending
    history.sort((a, b) => b.date.localeCompare(a.date));

    return { history };
  } catch (err) {
    console.error(`Error fetching dividends for ${yahooTicker}:`, err);
    return { history: [], error: String(err) };
  }
}

function projectDividends(
  history: DividendEvent[],
  ticker: string,
  type: string,
  quantity: number,
): DividendEvent[] {
  if (history.length === 0) return [];

  // For FIIs, dividends are typically monthly
  // For stocks, quarterly or semi-annual
  // Estimate based on recent history

  const now = new Date();
  const projected: DividendEvent[] = [];

  // Calculate average dividend from last 12 months
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const recentDivs = history.filter(d => new Date(d.date) >= oneYearAgo);
  if (recentDivs.length === 0) return [];

  const avgAmount = recentDivs.reduce((s, d) => s + d.amount, 0) / recentDivs.length;

  // Determine frequency
  const isFII = type === "FII";
  const monthsBetween = isFII ? 1 : Math.max(1, Math.round(12 / recentDivs.length));

  // Find last dividend month
  const lastDivDate = new Date(history[0].date);
  let nextDate = new Date(lastDivDate);

  // Project forward up to 12 months
  for (let i = 0; i < 12; i++) {
    nextDate = new Date(nextDate);
    nextDate.setMonth(nextDate.getMonth() + monthsBetween);

    if (nextDate <= now) continue;

    const futureDate = new Date(now);
    futureDate.setMonth(futureDate.getMonth() + 12);
    if (nextDate > futureDate) break;

    projected.push({
      date: nextDate.toISOString().split("T")[0],
      amount: Math.round(avgAmount * 100) / 100,
      ticker,
    });
  }

  return projected;
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

    // Only fetch for dividend-paying asset types
    const eligibleTypes = ["Ação", "FII", "ETF"];
    const eligible = holdings.filter((h: any) => eligibleTypes.includes(h.type));

    // Fetch all dividend histories in parallel (limit to 20)
    const limited = eligible.slice(0, 20);
    const results = await Promise.all(
      limited.map(async (h: any) => {
        const { history, error } = await fetchDividendHistory(h.ticker);
        const projected = projectDividends(history, h.ticker, h.type, h.quantity);

        // Calculate total received (per share) and projected income
        const totalPerShare12m = history
          .filter(d => {
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            return new Date(d.date) >= oneYearAgo;
          })
          .reduce((s, d) => s + d.amount, 0);

        const annualIncome = totalPerShare12m * h.quantity;
        const currentValue = h.currentPrice * h.quantity;
        const yieldPct = currentValue > 0 ? (annualIncome / currentValue) * 100 : 0;

        return {
          ticker: h.ticker,
          name: h.name,
          type: h.type,
          quantity: h.quantity,
          history,
          projected,
          totalPerShare12m: Math.round(totalPerShare12m * 100) / 100,
          annualIncome: Math.round(annualIncome * 100) / 100,
          yieldPct: Math.round(yieldPct * 100) / 100,
          error,
        };
      })
    );

    // Build calendar data: aggregate all projected dividends by month
    const allProjected = results.flatMap(r =>
      r.projected.map(p => ({
        ...p,
        totalAmount: Math.round(p.amount * r.quantity * 100) / 100,
        name: r.name,
        type: r.type,
      }))
    );

    // Group by month
    const calendarMap: Record<string, { month: string; events: any[]; total: number }> = {};
    for (const p of allProjected) {
      const month = p.date.substring(0, 7); // YYYY-MM
      if (!calendarMap[month]) {
        calendarMap[month] = { month, events: [], total: 0 };
      }
      calendarMap[month].events.push(p);
      calendarMap[month].total += p.totalAmount;
    }

    const calendar = Object.values(calendarMap).sort((a, b) => a.month.localeCompare(b.month));

    // Summary
    const totalAnnualIncome = results.reduce((s, r) => s + r.annualIncome, 0);
    const monthlyAvg = totalAnnualIncome / 12;
    const totalProjected12m = allProjected.reduce((s, p) => s + p.totalAmount, 0);

    return new Response(
      JSON.stringify({
        assets: results,
        calendar,
        summary: {
          totalAnnualIncome: Math.round(totalAnnualIncome * 100) / 100,
          monthlyAverage: Math.round(monthlyAvg * 100) / 100,
          totalProjected12m: Math.round(totalProjected12m * 100) / 100,
          assetsWithDividends: results.filter(r => r.history.length > 0).length,
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
