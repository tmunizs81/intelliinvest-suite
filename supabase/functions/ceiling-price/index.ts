

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const { portfolio } = await req.json();
    if (!portfolio?.length) {
      return new Response(JSON.stringify({ error: "portfolio required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portfolioText = portfolio.map((a: any) =>
      `${a.ticker} (${a.type}): Preço atual R$${a.currentPrice?.toFixed(2)}, PM R$${a.avgPrice?.toFixed(2)}, Setor: ${a.sector || 'N/A'}`
    ).join("\n");

    const prompt = `Calcule o Preço Teto por Bazin e por Graham para cada ativo desta carteira brasileira:

${portfolioText}

Regras:
- Bazin: Preço Teto = (Dividend Yield mínimo desejado 6%) → DPA estimado / 0.06
- Graham: Preço Teto = √(22.5 × LPA × VPA) — use estimativas realistas baseadas no setor
- Para FIIs: use yield médio do setor como base
- Para Cripto/ETF/Renda Fixa: marque como "N/A" se não aplicável

Use a ferramenta para retornar resultado estruturado.`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista fundamentalista especialista em valuation de ações e FIIs brasileiros. Calcule preços teto de forma conservadora e realista." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "calculate_ceiling_prices",
            description: "Return ceiling price calculations",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Brief overall assessment (max 100 chars)" },
                assets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      current_price: { type: "number" },
                      bazin_ceiling: { type: "number", description: "Bazin ceiling price, 0 if N/A" },
                      graham_ceiling: { type: "number", description: "Graham ceiling price, 0 if N/A" },
                      is_below_bazin: { type: "boolean" },
                      is_below_graham: { type: "boolean" },
                      verdict: { type: "string", description: "Buy/Hold/Expensive (max 20 chars)" },
                      note: { type: "string", description: "Brief note (max 60 chars)" },
                    },
                    required: ["ticker", "current_price", "bazin_ceiling", "graham_ceiling", "is_below_bazin", "is_below_graham", "verdict", "note"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summary", "assets"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "calculate_ceiling_prices" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ceiling-price error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
