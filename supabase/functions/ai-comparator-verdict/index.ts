

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { assets } = await req.json();
    if (!assets || assets.length < 2) {
      return new Response(JSON.stringify({ error: "Mínimo 2 ativos para comparar" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const assetsDescription = assets.map((a: any, i: number) => {
      let desc = `## Ativo ${i + 1}: ${a.ticker} (${a.name})\n`;
      desc += `- Tipo: ${a.type}\n`;
      desc += `- Preço atual: R$ ${a.currentPrice?.toFixed(2) || 'N/A'}\n`;
      desc += `- Variação 24h: ${a.change24h?.toFixed(2) || 0}%\n`;
      if (a.aiSignal) {
        desc += `- Sinal IA: ${a.aiSignal.recommendation} (confiança ${a.aiSignal.confidence}%)\n`;
        desc += `- Resumo: ${a.aiSignal.summary}\n`;
        if (a.aiSignal.targetPrice) desc += `- Alvo: R$ ${a.aiSignal.targetPrice}\n`;
        if (a.aiSignal.stopLoss) desc += `- Stop Loss: R$ ${a.aiSignal.stopLoss}\n`;
      }
      if (a.indicators) {
        desc += `- RSI: ${a.indicators.rsi?.toFixed(1)}\n`;
        desc += `- MACD Histograma: ${a.indicators.macd?.histogram?.toFixed(3)}\n`;
        desc += `- EMA9: ${a.indicators.ema9?.toFixed(2)}, SMA20: ${a.indicators.sma20?.toFixed(2)}\n`;
      }
      if (a.fundamentals) {
        if (a.fundamentals.pe) desc += `- P/L: ${Number(a.fundamentals.pe).toFixed(1)}\n`;
        if (a.fundamentals.pb) desc += `- P/VP: ${Number(a.fundamentals.pb).toFixed(2)}\n`;
      }
      if (a.dividendYield) desc += `- Dividend Yield: ${a.dividendYield.toFixed(2)}%\n`;
      return desc;
    }).join("\n");

    const systemPrompt = `Você é um analista de investimentos brasileiro especializado. Analise os ativos comparados e determine o VENCEDOR da comparação. Responda SEMPRE em português do Brasil.

Estruture sua resposta EXATAMENTE assim:
1. Primeiro linha: "🏆 VENCEDOR: [TICKER]" 
2. Uma linha em branco
3. Um parágrafo curto (3-4 frases) justificando por que esse ativo é o melhor entre os comparados, considerando indicadores técnicos, fundamentalistas, sinal IA e momento de mercado.
4. Uma linha em branco
5. Uma tabela resumo comparativa curta dos pontos-chave.

Seja objetivo e direto. Não use markdown excessivo.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Compare os seguintes ativos e determine o vencedor:\n\n${assetsDescription}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido, tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const verdict = data.choices?.[0]?.message?.content || "Não foi possível gerar o veredito.";

    return new Response(JSON.stringify({ verdict }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-comparator-verdict error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
