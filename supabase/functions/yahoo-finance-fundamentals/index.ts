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

    // Fetch quote summary from Yahoo Finance v10 API
    const modules = "summaryDetail,defaultKeyStatistics,financialData,price,earnings";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooTicker}?modules=${modules}`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!resp.ok) {
      // Fallback: try v8 chart API for basic data
      const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1d`;
      const chartResp = await fetch(chartUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!chartResp.ok) {
        return new Response(
          JSON.stringify({ error: `Yahoo Finance HTTP ${resp.status}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const chartData = await chartResp.json();
      const meta = chartData.chart?.result?.[0]?.meta;

      return new Response(
        JSON.stringify({
          marketCap: null,
          pe: null,
          pb: null,
          roe: null,
          dividendYield: null,
          evEbitda: null,
          netMargin: null,
          debtToEquity: null,
          eps: null,
          revenue: null,
          ebitda: null,
          freeCashFlow: null,
          bookValue: null,
          beta: null,
          fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: meta?.fiftyTwoWeekLow ?? null,
          avgVolume: null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const result = data.quoteSummary?.result?.[0];

    if (!result) {
      return new Response(
        JSON.stringify({ error: "No data returned" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const summary = result.summaryDetail || {};
    const keyStats = result.defaultKeyStatistics || {};
    const financial = result.financialData || {};
    const price = result.price || {};

    const getRaw = (obj: any) => obj?.raw ?? null;

    const response = {
      // Valuation
      pe: getRaw(summary.trailingPE) ?? getRaw(keyStats.trailingPE),
      pb: getRaw(keyStats.priceToBook) ?? getRaw(summary.priceToBook),
      evEbitda: getRaw(keyStats.enterpriseToEbitda),
      eps: getRaw(keyStats.trailingEps),
      bookValue: getRaw(keyStats.bookValue),

      // Profitability
      roe: getRaw(financial.returnOnEquity) != null ? getRaw(financial.returnOnEquity) * 100 : null,
      netMargin: getRaw(financial.profitMargins) != null ? getRaw(financial.profitMargins) * 100 : null,

      // Dividends
      dividendYield: getRaw(summary.dividendYield) != null
        ? getRaw(summary.dividendYield) * 100
        : getRaw(summary.trailingAnnualDividendYield) != null
          ? getRaw(summary.trailingAnnualDividendYield) * 100
          : null,

      // Financial health
      debtToEquity: getRaw(financial.debtToEquity) != null ? getRaw(financial.debtToEquity) / 100 : null,
      marketCap: getRaw(price.marketCap),
      revenue: getRaw(financial.totalRevenue),
      ebitda: getRaw(financial.ebitda),
      freeCashFlow: getRaw(financial.freeCashflow),

      // Price
      fiftyTwoWeekHigh: getRaw(summary.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: getRaw(summary.fiftyTwoWeekLow),
      beta: getRaw(keyStats.beta) ?? getRaw(summary.beta),
      avgVolume: getRaw(summary.averageDailyVolume10Day) ?? getRaw(price.averageDailyVolume10Day),
    };

    return new Response(
      JSON.stringify(response),
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
