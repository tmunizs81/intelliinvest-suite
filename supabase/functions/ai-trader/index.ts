import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { messages, portfolio, analysisType } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build portfolio context if available
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
        "position-trades": "\n\nFOCO DESTA CONVERSA: O investidor quer sugestões de POSITION TRADES. Analise a carteira dele e sugira 3-5 operações de position trade com entrada, stop, alvo e justificativa técnica+fundamentalista. Considere o cenário macro atual.",
        "buy-sell": "\n\nFOCO DESTA CONVERSA: O investidor quer saber O QUE COMPRAR e O QUE VENDER agora. Analise a carteira dele, identifique ativos para realizar lucro, ativos para aumentar posição, e novos ativos para entrar. Justifique cada recomendação.",
        "portfolio-review": "\n\nFOCO DESTA CONVERSA: Faça uma revisão completa da carteira. Analise diversificação, risco, correlações, e sugira melhorias na alocação. Compare com benchmarks (CDI, Ibovespa).",
        "macro-analysis": "\n\nFOCO DESTA CONVERSA: Analise o cenário macroeconômico atual e como ele impacta a carteira do investidor. Considere Selic, inflação, dólar, commodities, cenário global, e sugira posicionamentos.",
        "risk-management": "\n\nFOCO DESTA CONVERSA: Analise o risco da carteira. Identifique concentrações perigosas, correlações excessivas, sugira stops e dimensionamento de posições. Calcule o risco máximo da carteira.",
      };
      contextPrompt += typePrompts[analysisType] || "";
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: contextPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(
        JSON.stringify({ error: "Erro no serviço de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("ai-trader error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
