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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assets, cashBalance, question } = await req.json();

    const portfolioSummary = (assets || []).map((a: any) => 
      `${a.ticker}: ${a.quantity}un, PM R$${a.avgPrice?.toFixed(2)}, Atual R$${a.currentPrice?.toFixed(2)}, Var24h ${a.change24h?.toFixed(2)}%, Tipo: ${a.type}, Setor: ${a.sector || 'N/A'}, Alocação: ${a.allocation}%`
    ).join('\n');

    const totalValue = (assets || []).reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const totalCost = (assets || []).reduce((s: number, a: any) => s + (a.avgPrice * a.quantity), 0);
    const totalProfit = totalValue - totalCost;
    const profitPct = totalCost > 0 ? (totalProfit / totalCost * 100) : 0;

    const systemPrompt = `Você é um consultor de investimentos especializado no mercado brasileiro. Analise a carteira do investidor e forneça recomendações personalizadas.

REGRAS:
- Sempre considere o perfil de risco baseado na composição da carteira
- Recomende ações concretas: COMPRAR, MANTER, VENDER ou REDUZIR
- Justifique cada recomendação com dados da carteira
- Considere diversificação, concentração e correlação
- Use linguagem clara e direta em português
- Formate com markdown: use ##, ###, **bold**, bullets
- Inclua disclaimer que não é recomendação formal

CARTEIRA DO INVESTIDOR:
Valor Total: R$ ${totalValue.toFixed(2)}
Custo Total: R$ ${totalCost.toFixed(2)}
Lucro/Prejuízo: R$ ${totalProfit.toFixed(2)} (${profitPct.toFixed(2)}%)
Caixa Disponível: R$ ${(cashBalance || 0).toFixed(2)}

ATIVOS:
${portfolioSummary}`;

    const userMessage = question || "Analise minha carteira e me dê recomendações de investimento personalizadas. Quais ativos devo comprar, manter ou vender? Sugira também novos ativos.";

    const response = await callAI({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("ai-advisor error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
