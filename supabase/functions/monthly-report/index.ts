const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const REPORT_TOOL = {
  type: "function" as const,
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
        recommendations: { type: "array", items: { type: "string" } },
        outlook: { type: "string", description: "Market outlook for next month" },
      },
      required: ["title", "period", "executive_summary", "total_value", "total_return_pct", "monthly_return_pct", "top_performers", "worst_performers", "dividends_analysis", "risk_assessment", "recommendations", "outlook"],
      additionalProperties: false,
    },
  },
};

async function callAI(url: string, apiKey: string, model: string, messages: any[]) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: [REPORT_TOOL],
      tool_choice: { type: "function", function: { name: "generate_report" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`AI ${model} error ${response.status}:`, text);
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    // Fallback: try to parse content directly
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return jsonMatch[0];
    }
    throw new Error("No structured response from AI");
  }
  return toolCall.function.arguments;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, period } = await req.json();
    if (!portfolio?.length) {
      return new Response(JSON.stringify({ error: "Carteira vazia" }), {
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

    const periodStr = period || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    const messages = [
      { role: "system", content: "Você é um analista de investimentos sênior que produz relatórios mensais profissionais para investidores brasileiros. Use linguagem técnica mas acessível." },
      { role: "user", content: `Gere um relatório mensal completo da carteira para o período ${periodStr}:\n\nPatrimônio: R$${totalValue.toFixed(2)} | Custo: R$${totalCost.toFixed(2)} | Retorno Total: ${totalReturn.toFixed(2)}%\n${portfolio.length} ativos:\n${portfolioText}\n\nInclua: resumo executivo, performance geral, top 3 melhores e piores, análise de dividendos, recomendações para o próximo mês, e avaliação de risco.` },
    ];

    // Try DeepSeek first, then Gemini as fallback
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    let result: string | null = null;

    if (DEEPSEEK_API_KEY) {
      try {
        result = await callAI(
          "https://api.deepseek.com/v1/chat/completions",
          DEEPSEEK_API_KEY, "deepseek-chat", messages
        );
      } catch (e) {
        console.error("DeepSeek failed, trying fallback:", e);
      }
    }

    if (!result && GEMINI_API_KEY) {
      try {
        result = await callAI(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          GEMINI_API_KEY, "gemini-2.5-flash", messages
        );
      } catch (e) {
        console.error("Gemini fallback also failed:", e);
      }
    }

    if (!result) {
      return new Response(JSON.stringify({ error: "Não foi possível gerar o relatório. Tente novamente em alguns instantes." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate JSON before returning
    try {
      JSON.parse(result);
    } catch {
      return new Response(JSON.stringify({ error: "Resposta inválida da IA. Tente novamente." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(result, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("monthly-report error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
