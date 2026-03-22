const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

// ─── Per-user rate limiting ───
const userCalls = new Map<string, number[]>();
const MAX_CALLS_PER_MIN = 10;

function checkRateLimit(req: Request): Response | null {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let userId = "anon";
  try { if (parts[1]) { const p = JSON.parse(atob(parts[1])); userId = p.sub || "anon"; } } catch {}
  const now = Date.now();
  const calls = (userCalls.get(userId) || []).filter(t => now - t < 60000);
  if (calls.length >= MAX_CALLS_PER_MIN) {
    return new Response(JSON.stringify({ error: "Rate limit: máximo de 10 chamadas/minuto." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  calls.push(now);
  userCalls.set(userId, calls);
  return null;
}

async function callAI(body) {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");

  // Primary: DeepSeek
  if (DEEPSEEK_API_KEY) {
    try {
      const { model, ...rest } = body;
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
      console.warn("DeepSeek failed:", resp.status, "falling back to Lovable AI");
    } catch (e) { console.warn("DeepSeek error, falling back:", e); }
  }
  throw new Error("DeepSeek API unavailable");
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

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

    const { response, provider } = await callAI({
      model: "gemini-2.5-flash",
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
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider },
    });
  } catch (err) {
    console.error("ai-advisor error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
