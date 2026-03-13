

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body) {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (DEEPSEEK_API_KEY) {
    try {
      const { model, ...rest } = body;
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
      console.warn("DeepSeek failed:", resp.status, "falling back to Lovable AI");
    } catch (e) { console.warn("DeepSeek error, falling back:", e); }
  }

  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");
  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: model && model.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
  });
  return { response: resp, provider: "lovable" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, scenario } = await req.json();
    if (!portfolio?.length || !scenario) {
      return new Response(JSON.stringify({ error: "portfolio and scenario required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      return `${a.ticker} (${a.type}, ${a.sector || 'N/A'}): R$${value.toFixed(2)}`;
    }).join("\n");

    const prompt = `Faça um backtesting: simule como esta carteira teria performado no cenário histórico "${scenario}".

Carteira atual (R$${totalValue.toFixed(2)}):
${portfolioText}

Use dados históricos reais do mercado brasileiro. Calcule drawdown máximo, recuperação e retorno total no período.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um analista quantitativo especializado em backtesting de carteiras brasileiras. Use dados históricos reais para simular cenários." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "backtest_result",
            description: "Return backtesting results",
            parameters: {
              type: "object",
              properties: {
                scenario_name: { type: "string" },
                period: { type: "string", description: "e.g. Mar/2020 - Jun/2020" },
                initial_value: { type: "number" },
                lowest_value: { type: "number" },
                final_value: { type: "number" },
                max_drawdown_pct: { type: "number" },
                total_return_pct: { type: "number" },
                recovery_days: { type: "number", description: "Days to recover from lowest point" },
                timeline: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string", description: "Month/year label" },
                      value_pct: { type: "number", description: "Portfolio value as % of initial (100=no change)" },
                    },
                    required: ["label", "value_pct"],
                    additionalProperties: false,
                  },
                },
                asset_impacts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      return_pct: { type: "number" },
                      worst_drawdown_pct: { type: "number" },
                    },
                    required: ["ticker", "return_pct", "worst_drawdown_pct"],
                    additionalProperties: false,
                  },
                },
                lessons: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-4 lessons learned in Portuguese",
                },
                summary: { type: "string", description: "Brief summary in Portuguese (max 120 chars)" },
              },
              required: ["scenario_name", "period", "initial_value", "lowest_value", "final_value", "max_drawdown_pct", "total_return_pct", "recovery_days", "timeline", "asset_impacts", "lessons", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "backtest_result" } },
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
    console.error("backtesting error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
