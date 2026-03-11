const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callAI(body: any): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  if (LOVABLE_API_KEY) {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
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

const SYSTEM_PROMPT = `Você é o assistente IA do T2-Simplynvest, uma plataforma de controle de investimentos. Você tem acesso aos dados reais da carteira do usuário.

REGRAS:
- Responda SEMPRE em português brasileiro
- Use dados concretos da carteira quando disponíveis
- Seja direto, objetivo e amigável
- Formate números como moeda (R$) e percentuais
- Use markdown para formatar respostas
- Faça cálculos precisos baseados nos dados fornecidos
- Nunca invente dados que não foram fornecidos`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, portfolio } = await req.json();
    if (!messages || !Array.isArray(messages)) return new Response(JSON.stringify({ error: "messages array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
        return `- ${a.ticker} (${a.type}, ${a.sector || 'N/A'}): ${a.quantity}un, PM R$${a.avgPrice?.toFixed(2)}, Atual R$${a.currentPrice?.toFixed(2)}, Var24h: ${a.change24h?.toFixed(2)}%, P/L: R$${profit.toFixed(2)} (${profitPct.toFixed(1)}%), Alocação: ${a.allocation?.toFixed(1)}%`;
      }).join("\n");
      portfolioContext = `\n\nCARTEIRA ATUAL DO USUÁRIO (dados reais):
Patrimônio: R$${totalValue.toFixed(2)} | Custo: R$${totalCost.toFixed(2)} | Retorno: ${totalReturn.toFixed(2)}%
${portfolio.length} ativos:
${portfolioText}
Data: ${new Date().toLocaleDateString('pt-BR')}`;
    }

    const response = await callAI({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: SYSTEM_PROMPT + portfolioContext }, ...messages],
      stream: true,
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (err) {
    console.error("portfolio-chat error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
