

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

    const { portfolio } = await req.json();
    if (!portfolio?.length) {
      return new Response(JSON.stringify({ error: "portfolio required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const alloc = totalValue > 0 ? (value / totalValue * 100) : 0;
      return `${a.ticker} (${a.type}, ${a.sector || 'N/A'}): R$${value.toFixed(2)} (${alloc.toFixed(1)}%)`;
    }).join("\n");

    const prompt = `Analise esta carteira e sugira rebalanceamento:

Patrimônio: R$${totalValue.toFixed(2)} | ${portfolio.length} ativos
${portfolioText}

Considere: diversificação ideal por tipo (Ações, FIIs, ETFs, Cripto, Renda Fixa), concentração setorial, e mercado atual.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um consultor financeiro especialista em alocação de ativos no mercado brasileiro. Sugira rebalanceamento prático e acionável." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_rebalance",
            description: "Return rebalancing suggestions",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Overall assessment (max 100 chars)" },
                current_allocation: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      category: { type: "string" },
                      current_pct: { type: "number" },
                      ideal_pct: { type: "number" },
                      diff_pct: { type: "number" },
                    },
                    required: ["category", "current_pct", "ideal_pct", "diff_pct"],
                    additionalProperties: false,
                  },
                },
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      action: { type: "string", enum: ["buy", "sell", "hold"] },
                      ticker: { type: "string" },
                      reason: { type: "string", description: "Brief reason (max 80 chars)" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["action", "ticker", "reason", "priority"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["summary", "current_allocation", "suggestions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_rebalance" } },
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
    console.error("portfolio-rebalance error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
