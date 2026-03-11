

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

    const { portfolio, scenario } = await req.json();
    if (!portfolio?.length || !scenario) {
      return new Response(JSON.stringify({ error: "portfolio and scenario required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      return `${a.ticker} (${a.type}): ${a.quantity}un, R$${a.currentPrice?.toFixed(2)}, Total R$${value.toFixed(2)}`;
    }).join("\n");

    const prompt = `Simule o cenário: "${scenario}"

Carteira atual (R$${totalValue.toFixed(2)}):
${portfolioText}

Calcule o impacto estimado no patrimônio e em cada ativo. Use a ferramenta para retornar resultado estruturado.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um simulador financeiro. Calcule impactos de cenários na carteira do investidor brasileiro de forma realista e educativa." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "simulate_scenario",
            description: "Return simulation results",
            parameters: {
              type: "object",
              properties: {
                scenario_name: { type: "string" },
                summary: { type: "string", description: "Impact summary (max 120 chars)" },
                current_total: { type: "number" },
                projected_total: { type: "number" },
                impact_pct: { type: "number" },
                impacts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      current_value: { type: "number" },
                      projected_value: { type: "number" },
                      impact_pct: { type: "number" },
                      reasoning: { type: "string" },
                    },
                    required: ["ticker", "current_value", "projected_value", "impact_pct", "reasoning"],
                    additionalProperties: false,
                  },
                },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["scenario_name", "summary", "current_total", "projected_total", "impact_pct", "impacts", "recommendations"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "simulate_scenario" } },
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
    console.error("portfolio-simulator error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
