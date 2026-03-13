const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (OPENROUTER_API_KEY) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: body.model || "google/gemini-2.5-flash-preview-09-2025" }),
    });
    if (resp.ok) return { response: resp, provider: "openrouter" };
    console.warn(`OpenRouter failed (${resp.status}), trying Gemini...`);
    try { await resp.text(); } catch {}
  }

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return { response: resp, provider: "gemini" };
    console.warn(`Gemini failed (${resp.status}), trying Groq...`);
    try { await resp.text(); } catch {}
  }

  if (!GROQ_API_KEY) throw new Error("No AI provider available");
  console.log("Using Groq fallback");
  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
  });
  return { response: groqResp, provider: "groq" };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { holdings } = await req.json();
    if (!holdings?.length) return new Response(JSON.stringify({ error: "holdings required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const holdingsText = holdings.map((a: any) => `${a.ticker} (${a.type}): ${a.quantity}un a R$${a.currentPrice?.toFixed(2)}`).join("\n");

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: "Você é um especialista em dividendos do mercado brasileiro. Projete dividendos futuros com base em dados históricos típicos." },
        { role: "user", content: `Projete dividendos futuros (próximos 12 meses):\n\n${holdingsText}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "dividend_forecast",
          description: "Return dividend projections",
          parameters: {
            type: "object",
            properties: {
              total_projected_12m: { type: "number" }, monthly_average: { type: "number" },
              yield_on_cost: { type: "number" },
              forecasts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ticker: { type: "string" }, frequency: { type: "string" },
                    expected_yield: { type: "number" }, projected_per_share: { type: "number" },
                    projected_total: { type: "number" },
                    confidence: { type: "string", enum: ["alta", "média", "baixa"] },
                    notes: { type: "string" },
                  },
                  required: ["ticker", "frequency", "expected_yield", "projected_per_share", "projected_total", "confidence", "notes"],
                  additionalProperties: false,
                },
              },
              insights: { type: "string" },
            },
            required: ["total_projected_12m", "monthly_average", "yield_on_cost", "forecasts", "insights"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "dividend_forecast" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    const parsedResult = JSON.parse(toolCall.function.arguments);
    parsedResult._provider = provider;
    return new Response(JSON.stringify(parsedResult), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-dividend-forecast error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
