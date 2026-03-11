const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body: any): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  if (LOVABLE_API_KEY) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`Lovable AI failed (${resp.status}), trying DeepSeek fallback...`);
    try { await resp.text(); } catch {}
  }
  if (!DEEPSEEK_API_KEY) throw new Error("No AI provider available");
  console.log("Using DeepSeek fallback");
  return fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "deepseek-chat" }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio } = await req.json();
    if (!portfolio || portfolio.length === 0) return new Response(JSON.stringify({ error: "Portfolio vazio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const systemPrompt = `Você é um analista quantitativo de investimentos brasileiro. Classifique CADA ativo em 4 dimensões com nota de 1 a 10.

DIMENSÕES:
1. **Valuation** (1-10): Barato ou caro vs valor justo?
2. **Momento** (1-10): Momentum positivo?
3. **Dividendos** (1-10): Bom pagador?
4. **Risco** (1-10): Menor risco = maior nota.

NOTA FINAL: Média ponderada (Valuation 30%, Momento 25%, Dividendos 25%, Risco 20%).`;

    const userPrompt = `Analise e classifique cada ativo:\n\n${JSON.stringify(portfolio.map((a: any) => ({
      ticker: a.ticker, name: a.name, type: a.type, quantity: a.quantity,
      avgPrice: a.avgPrice, currentPrice: a.currentPrice, change24h: a.change24h,
      allocation: a.allocation, sector: a.sector,
    })), null, 2)}`;

    const response = await callAI({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "asset_scoring",
          description: "Return scoring for each asset",
          parameters: {
            type: "object",
            properties: {
              scores: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ticker: { type: "string" },
                    valuation: { type: "number" }, momentum: { type: "number" },
                    dividends: { type: "number" }, risk: { type: "number" },
                    overall: { type: "number" },
                    summary: { type: "string", description: "One-line summary (max 80 chars)" },
                  },
                  required: ["ticker", "valuation", "momentum", "dividends", "risk", "overall", "summary"],
                  additionalProperties: false,
                },
              },
              topPick: { type: "string" }, worstPick: { type: "string" },
              insight: { type: "string" },
            },
            required: ["scores", "topPick", "worstPick", "insight"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "asset_scoring" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    return new Response(JSON.stringify(JSON.parse(toolCall.function.arguments)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-scoring error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
