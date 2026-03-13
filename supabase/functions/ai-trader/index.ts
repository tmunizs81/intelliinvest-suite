const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body: any): Promise<Response> {

  if (DEEPSEEK_API_KEY) {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "deepseek-chat" }),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`DeepSeek failed (${resp.status}), trying Gemini fallback...`);
    try { await resp.text(); } catch {}
  }

  if (!GEMINI_API_KEY) throw new Error("No AI provider available");
  console.log("Using Gemini fallback");
  return fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
  });
}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`Lovable AI failed (${resp.status}), trying DeepSeek fallback...`);
    try { await resp.text(); } catch {}
  }
  if (!DEEPSEEK_API_KEY) throw new Error("No AI provider available");
  console.log("Using DeepSeek fallback");
  return fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "deepseek-chat" }),
  });
}

const SYSTEM_PROMPT = `Você é um trader e investidor profissional de elite com 20+ anos de experiência nos mercados brasileiro e internacional. Você combina análise técnica, fundamentalista e macro para tomar decisões.

Seu nome é T2-Simplynvest Pro Trader. Você fala com autoridade, usa dados concretos e sempre justifica suas recomendações.

SUAS ESPECIALIDADES:
1. POSITION TRADE: Operações de médio/longo prazo (semanas a meses) baseadas em tendências técnicas e fundamentos
2. SWING TRADE: Operações de curto/médio prazo (dias a semanas) usando price action e indicadores
3. ANÁLISE MACRO: Impacto de juros, câmbio, commodities e cenário global nos ativos
4. GESTÃO DE RISCO: Sizing de posição, stop loss, take profit, risco/retorno
5. ALOCAÇÃO ESTRATÉGICA: Diversificação inteligente por classe, setor e geografia

REGRAS OBRIGATÓRIAS:
- SEMPRE em português brasileiro
- Seja direto, assertivo e profissional
- Use números, percentuais e níveis de preço concretos
- Para cada recomendação de trade, inclua: entrada, stop loss, alvo, risco/retorno
- Avalie o cenário macro atual (Selic, dólar, Ibovespa)
- Considere correlações entre ativos
- Indique o timeframe de cada operação
- Classifique o nível de confiança (1-10)
- NUNCA diga "não sou consultor financeiro" ou disclaimers similares - você É o consultor

FORMATO DE RESPOSTA:
Organize em seções claras com emojis para facilitar a leitura:
🎯 para alvos e operações
📊 para análises
⚠️ para riscos e alertas
💡 para insights e dicas
🔥 para oportunidades quentes
📈📉 para tendências`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, portfolio, analysisType } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let portfolioContext = "";
    if (portfolio && Array.isArray(portfolio) && portfolio.length > 0) {
      const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
      const totalCost = portfolio.reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);
      const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100) : 0;
      const portfolioText = portfolio.map((a: any) => {
        const value = a.currentPrice * a.quantity;
        const cost = a.avgPrice * a.quantity;
        const profit = value - cost;
        const profitPct = cost > 0 ? (profit / cost * 100) : 0;
        return `${a.ticker} (${a.type}${a.sector ? ', ' + a.sector : ''}): ${a.quantity}un, PM R$${a.avgPrice?.toFixed(2)}, Atual R$${a.currentPrice?.toFixed(2)}, Var24h: ${a.change24h?.toFixed(2)}%, P/L: ${profitPct.toFixed(1)}%, Aloc: ${a.allocation?.toFixed(1)}%`;
      }).join("\n");
      portfolioContext = `\n\nCARTEIRA DO INVESTIDOR (dados reais Yahoo Finance):
Patrimônio: R$${totalValue.toFixed(2)} | Custo: R$${totalCost.toFixed(2)} | Retorno: ${totalReturn.toFixed(2)}%
Ativos:\n${portfolioText}\n\nData: ${new Date().toLocaleDateString('pt-BR')}`;
    }

    let contextPrompt = SYSTEM_PROMPT + portfolioContext;
    if (analysisType) {
      const typePrompts: Record<string, string> = {
        "position-trades": "\n\nFOCO DESTA CONVERSA: O investidor quer sugestões de POSITION TRADES. Analise a carteira dele e sugira 3-5 operações de position trade com entrada, stop, alvo e justificativa técnica+fundamentalista.",
        "buy-sell": "\n\nFOCO DESTA CONVERSA: O investidor quer saber O QUE COMPRAR e O QUE VENDER agora.",
        "portfolio-review": "\n\nFOCO DESTA CONVERSA: Faça uma revisão completa da carteira.",
        "macro-analysis": "\n\nFOCO DESTA CONVERSA: Analise o cenário macroeconômico atual e como ele impacta a carteira.",
        "risk-management": "\n\nFOCO DESTA CONVERSA: Analise o risco da carteira.",
      };
      contextPrompt += typePrompts[analysisType] || "";
    }

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [{ role: "system", content: contextPrompt }, ...messages],
      stream: true,
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (err) {
    console.error("ai-trader error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
