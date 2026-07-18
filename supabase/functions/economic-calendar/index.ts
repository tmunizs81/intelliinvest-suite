const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// TradingView public economic calendar endpoint (used by their public widget).
// importance: -1 = low, 0 = medium, 1 = high
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const now = new Date();
    const from = new Date(now);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    const url = `https://economic-calendar.tradingview.com/events?from=${from.toISOString()}&to=${to.toISOString()}&countries=BR,US,EU,CN,GB,JP`;

    const resp = await fetch(url, {
      headers: {
        "Origin": "https://www.tradingview.com",
        "Referer": "https://www.tradingview.com/",
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!resp.ok) throw new Error(`TradingView ${resp.status}`);
    const data = await resp.json();

    const events = (data?.result || []).map((e: any) => ({
      id: e.id,
      title: e.title,
      country: e.country,
      currency: e.currency,
      date: e.date,
      importance: typeof e.importance === "number" ? e.importance : 0, // -1|0|1
      actual: e.actual ?? null,
      forecast: e.forecast ?? null,
      previous: e.previous ?? null,
      unit: e.unit || "",
      period: e.period || "",
    }));

    // Sort by importance desc then time
    events.sort((a: any, b: any) => (b.importance - a.importance) || (a.date > b.date ? 1 : -1));

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
    });
  } catch (err) {
    console.error("economic-calendar error:", err);
    return new Response(JSON.stringify({ error: String(err), events: [] }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
