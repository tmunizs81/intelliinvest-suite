

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { portfolio, period, benchmarks } = await req.json();
    if (!portfolio?.length || !period) {
      return new Response(JSON.stringify({ error: "portfolio and period required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const totalCost = portfolio.reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);

    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const cost = a.avgPrice * a.quantity;
      return `${a.ticker} (${a.type}): Custo R$${cost.toFixed(2)}, Atual R$${value.toFixed(2)}`;
    }).join("\n");

    const prompt = `Calcule a rentabilidade desta carteira no período "${period}" e compare com os benchmarks: ${(benchmarks || ['CDI', 'IBOV', 'IPCA']).join(', ')}.

Carteira (Custo: R$${totalCost.toFixed(2)}, Atual: R$${totalValue.toFixed(2)}):
${portfolioText}

Use valores realistas dos benchmarks para o período solicitado. Retorne resultado estruturado.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista de performance de investimentos brasileiro. Calcule rentabilidade e compare com benchmarks de forma precisa usando dados históricos reais." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "calculate_profitability",
            description: "Return profitability comparison",
            parameters: {
              type: "object",
              properties: {
                period_label: { type: "string" },
                portfolio_return_pct: { type: "number" },
                portfolio_return_value: { type: "number" },
                benchmarks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      return_pct: { type: "number" },
                      difference_pct: { type: "number", description: "Portfolio return minus benchmark" },
                      is_beating: { type: "boolean" },
                    },
                    required: ["name", "return_pct", "difference_pct", "is_beating"],
                    additionalProperties: false,
                  },
                },
                top_performers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      return_pct: { type: "number" },
                    },
                    required: ["ticker", "return_pct"],
                    additionalProperties: false,
                  },
                },
                worst_performers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      return_pct: { type: "number" },
                    },
                    required: ["ticker", "return_pct"],
                    additionalProperties: false,
                  },
                },
                analysis: { type: "string", description: "Brief analysis in Portuguese (max 150 chars)" },
              },
              required: ["period_label", "portfolio_return_pct", "portfolio_return_value", "benchmarks", "top_performers", "worst_performers", "analysis"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "calculate_profitability" } },
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
    console.error("profitability error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
