

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!DEEPSEEK_API_KEY && !GEMINI_API_KEY) throw new Error("No AI API key configured");

    const { portfolio, monthlyAmount } = await req.json();
    if (!portfolio?.length || !monthlyAmount) {
      return new Response(JSON.stringify({ error: "portfolio and monthlyAmount required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const alloc = totalValue > 0 ? (value / totalValue * 100) : 0;
      return `${a.ticker} (${a.type}, ${a.sector || 'N/A'}): R$${value.toFixed(2)} (${alloc.toFixed(1)}%), Preço: R$${a.currentPrice?.toFixed(2)}`;
    }).join("\n");

    const prompt = `Dado um aporte mensal de R$${monthlyAmount.toFixed(2)}, sugira como distribuir entre os ativos para rebalancear a carteira:

Patrimônio: R$${totalValue.toFixed(2)} | ${portfolio.length} ativos
${portfolioText}

Sugira quais ativos comprar e quanto aportar em cada um para aproximar a carteira da alocação ideal. Considere preços atuais para calcular quantidade de cotas.`;

    const response = await fetch(DEEPSEEK_API_KEY ? "https://api.deepseek.com/v1/chat/completions" : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY || GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEEPSEEK_API_KEY ? "deepseek-chat" : "gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um consultor financeiro especialista em aportes mensais e DCA (Dollar Cost Averaging) no mercado brasileiro. Sugira alocação prática do aporte mensal." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_contribution",
            description: "Return monthly contribution suggestions",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "Brief strategy summary (max 100 chars)" },
                total_amount: { type: "number" },
                allocations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      ticker: { type: "string" },
                      amount: { type: "number", description: "Amount in BRL to invest" },
                      shares: { type: "number", description: "Approximate shares to buy" },
                      percentage: { type: "number", description: "% of monthly amount" },
                      reason: { type: "string", description: "Brief reason (max 60 chars)" },
                    },
                    required: ["ticker", "amount", "shares", "percentage", "reason"],
                    additionalProperties: false,
                  },
                },
                rationale: { type: "string", description: "Overall rationale in Portuguese (max 200 chars)" },
              },
              required: ["summary", "total_amount", "allocations", "rationale"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_contribution" } },
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
    console.error("smart-contribution error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
