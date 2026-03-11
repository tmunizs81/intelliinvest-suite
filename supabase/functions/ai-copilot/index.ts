

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

    const { ticker, name, type, quantity, avgPrice, currentPrice, operation, portfolio } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const operationValue = (quantity || 0) * (avgPrice || currentPrice || 0);
    let portfolioContext = "";
    if (portfolio?.length) {
      const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
      portfolioContext = `\nCarteira atual: R$${totalValue.toFixed(2)} em ${portfolio.length} ativos.`;
      const existing = portfolio.find((a: any) => a.ticker === ticker);
      if (existing) {
        portfolioContext += `\nJá possui ${existing.quantity}un de ${ticker} a PM R$${existing.avgPrice.toFixed(2)}, atual R$${existing.currentPrice.toFixed(2)}.`;
        portfolioContext += ` Alocação atual: ${existing.allocation?.toFixed(1)}%.`;
      }
    }

    const prompt = `Analise esta operação e dê um sinal rápido:

Operação: ${operation || 'COMPRA'} de ${quantity || '?'}un de ${ticker} (${name || type || ''}) a R$${(avgPrice || 0).toFixed(2)}
Preço atual de mercado: R$${(currentPrice || 0).toFixed(2)}
Valor da operação: R$${operationValue.toFixed(2)}
${portfolioContext}

Avalie: preço vs média, momento do ativo, impacto na diversificação, e dê um veredito.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Você é um copilot de investimentos. Analise operações e dê sinais rápidos: verde (favorável), amarelo (atenção), vermelho (desfavorável). Seja conciso e direto." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "operation_signal",
            description: "Return operation analysis signal",
            parameters: {
              type: "object",
              properties: {
                signal: { type: "string", enum: ["green", "yellow", "red"] },
                title: { type: "string", description: "One-line verdict (max 60 chars)" },
                reasons: {
                  type: "array",
                  items: { type: "string", description: "Short reason (max 80 chars)" },
                  description: "2-4 key reasons",
                },
                suggestion: { type: "string", description: "Brief actionable suggestion (max 120 chars)" },
                confidence: { type: "number", description: "Confidence 1-10" },
              },
              required: ["signal", "title", "reasons", "suggestion", "confidence"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "operation_signal" } },
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
    console.error("ai-copilot error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
