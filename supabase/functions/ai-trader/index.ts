const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

const SYSTEM_PROMPT = `Você é um AI Trader especialista no mercado financeiro brasileiro e internacional. Você analisa carteiras de investimentos e fornece recomendações estratégicas baseadas em análise técnica e fundamentalista.

Regras:
- Sempre responda em português do Brasil
- Use dados reais da carteira do investidor quando disponíveis
- Forneça análises objetivas com justificativas claras
- Inclua níveis de entrada, stop loss e alvos quando sugerir operações
- Considere o perfil de risco baseado na composição da carteira
- Nunca garanta retornos futuros
- Mencione riscos relevantes em cada recomendação
- Use formatação markdown para organizar as respostas`;

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return { response: resp, provider: "gemini" };
    console.warn(`Gemini failed (${resp.status}), trying Groq fallback...`);
    try { await resp.text(); } catch {}
  }

  if (!GROQ_API_KEY) throw new Error("No AI provider available");
  console.log("Using Groq fallback");
  const groqResp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
  });
  return { response: groqResp, provider: "groq" };
}
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

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
      messages: [{ role: "system", content: contextPrompt }, ...messages],
      stream: true,
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        // Return a friendly SSE stream with an explanation instead of an error
        const msg = response.status === 429
          ? "⏳ O serviço de IA está temporariamente sobrecarregado. Aguarde alguns segundos e tente novamente."
          : "💳 Créditos de IA insuficientes. Verifique seu plano.";
        const ssePayload = `data: ${JSON.stringify({ choices: [{ delta: { content: msg } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(ssePayload, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider } });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      const errMsg = "❌ Erro no serviço de IA. Tente novamente em instantes.";
      const errPayload = `data: ${JSON.stringify({ choices: [{ delta: { content: errMsg } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(errPayload, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider } });
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider } });
  } catch (err) {
    console.error("ai-trader error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
