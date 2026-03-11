import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BenchmarkQuote {
  dates: string[];
  values: number[];
}

async function fetchYahooHistory(ticker: string, range: string): Promise<BenchmarkQuote> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });

    if (!resp.ok) return { dates: [], values: [] };

    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) return { dates: [], values: [] };

    const timestamps: number[] = result.timestamp || [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];

    const dates: string[] = [];
    const values: number[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] !== null && closes[i] !== undefined) {
        dates.push(new Date(timestamps[i] * 1000).toISOString().split("T")[0]);
        values.push(closes[i] as number);
      }
    }

    return { dates, values };
  } catch (err) {
    console.error(`Error fetching ${ticker}:`, err);
    return { dates: [], values: [] };
  }
}

// CDI approximation: ~13.25% annual rate → daily compounding
function generateCDI(dates: string[], annualRate = 13.25): number[] {
  const dailyRate = Math.pow(1 + annualRate / 100, 1 / 252) - 1;
  const values: number[] = [100];
  for (let i = 1; i < dates.length; i++) {
    values.push(values[i - 1] * (1 + dailyRate));
  }
  return values;
}

function normalizeToPercent(values: number[]): number[] {
  if (values.length === 0) return [];
  const base = values[0];
  return values.map(v => ((v / base) - 1) * 100);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { range = "1y" } = await req.json();

    // Fetch IBOV and USD/BRL in parallel
    const [ibov, usd] = await Promise.all([
      fetchYahooHistory("^BVSP", range),
      fetchYahooHistory("BRL=X", range),
    ]);

    // Use IBOV dates as reference (most complete for BR market)
    const referenceDates = ibov.dates.length > 0 ? ibov.dates : usd.dates;

    // Generate CDI curve for the same period
    const cdiValues = generateCDI(referenceDates);

    // Normalize all to percentage returns from start
    const ibovPct = normalizeToPercent(ibov.values);
    const usdPct = normalizeToPercent(usd.values);
    const cdiPct = normalizeToPercent(cdiValues);

    // Build aligned data points
    const benchmarks: Record<string, { dates: string[]; values: number[] }> = {
      ibovespa: { dates: ibov.dates, values: ibovPct },
      dolar: { dates: usd.dates, values: usdPct },
      cdi: { dates: referenceDates, values: cdiPct },
    };

    return new Response(
      JSON.stringify({ benchmarks, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("benchmarks error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
