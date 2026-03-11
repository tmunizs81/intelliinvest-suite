

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

    const { portfolio, period } = await req.json();
    if (!portfolio?.length) {
      return new Response(JSON.stringify({ error: "portfolio required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const totalCost = portfolio.reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);
    const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;

    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const cost = a.avgPrice * a.quantity;
      const profit = value - cost;
      const profitPct = cost > 0 ? (profit / cost * 100) : 0;
      return `${a.ticker} (${a.type}): ${a.quantity}un, PM R$${a.avgPrice?.toFixed(2)}, Atual R$${a.currentPrice?.toFixed(2)}, P/L: R$${profit.toFixed(2)} (${profitPct.toFixed(1)}%), Aloc: ${a.allocation?.toFixed(1)}%`;
    }).join("\n");

    const prompt = `Gere um relatório mensal completo da carteira para o período ${period || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}:

Patrimônio: R$${totalValue.toFixed(2)} | Custo: R$${totalCost.toFixed(2)} | Retorno Total: ${totalReturn.toFixed(2)}%
${portfolio.length} ativos:
${portfolioText}

Inclua: resumo executivo, performance geral, top 3 melhores e piores, análise de dividendos, recomendações para o próximo mês, e avaliação de risco.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um analista de investimentos sênior que produz relatórios mensais profissionais para investidores brasileiros. Use linguagem técnica mas acessível. Formate com markdown." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_report",
            description: "Return monthly portfolio report",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                period: { type: "string" },
                executive_summary: { type: "string", description: "2-3 sentence overview" },
                total_value: { type: "number" },
                total_return_pct: { type: "number" },
                monthly_return_pct: { type: "number" },
                top_performers: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      return_pct: { type: "number" },
                      comment: { type: "string" },
                    },
                    required: ["ticker", "return_pct", "comment"],
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
                      comment: { type: "string" },
                    },
                    required: ["ticker", "return_pct", "comment"],
                    additionalProperties: false,
                  },
                },
                dividends_analysis: { type: "string" },
                risk_assessment: { type: "string" },
                recommendations: {
                  type: "array",
                  items: { type: "string" },
                },
                outlook: { type: "string", description: "Market outlook for next month" },
              },
              required: ["title", "period", "executive_summary", "total_value", "total_return_pct", "monthly_return_pct", "top_performers", "worst_performers", "dividends_analysis", "risk_assessment", "recommendations", "outlook"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_report" } },
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
    console.error("monthly-report error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
