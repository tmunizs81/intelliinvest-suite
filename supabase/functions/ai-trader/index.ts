import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

const SYSTEM_PROMPT = `Você é um AI Trader especialista no mercado financeiro brasileiro e internacional. Você analisa carteiras de investimentos e fornece recomendações estratégicas baseadas em análise técnica, fundamentalista e macroeconômica.

Regras:
- Sempre responda em português do Brasil
- Use OBRIGATORIAMENTE os dados de contexto injetados abaixo (preços, eventos, notícias, macro) - não invente números
- Ao sugerir operação: dê entrada, stop, alvo (com % de risco/retorno) e justificativa
- Cite fontes: "segundo o calendário econômico...", "com Selic a X%...", "o ativo Y caiu Z% hoje..."
- Considere concentração/correlação da carteira antes de recomendar
- Nunca garanta retornos; mencione riscos relevantes
- Use markdown com títulos, listas e negrito para organizar`;

async function callAI(body: unknown) {
  const key = Deno.env.get("DEEPSEEK_API_KEY");
  if (!key) throw new Error("DEEPSEEK_API_KEY não configurada");
  const { model: _ignore, ...rest } = body as Record<string, unknown>;
  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
  });
  return { response: resp, provider: "deepseek" };
}

// ─── Enriquecimento de contexto ───
type Ctx = { macro?: string; events?: string; dividends?: string; news?: string; metrics?: string };

async function fetchMacro(supa: ReturnType<typeof createClient>): Promise<string> {
  try {
    const { data } = await supa.functions.invoke("bcb-rates", { body: {} });
    if (!data) return "";
    const parts: string[] = [];
    if (data.selic) parts.push(`Selic: ${data.selic}% a.a.`);
    if (data.cdi) parts.push(`CDI: ${data.cdi}% a.a.`);
    if (data.ipca) parts.push(`IPCA 12m: ${data.ipca}%`);
    if (data.usd) parts.push(`USD/BRL: R$${Number(data.usd).toFixed(4)}`);
    return parts.length ? `MACRO BRASIL (fonte: BCB): ${parts.join(" | ")}` : "";
  } catch { return ""; }
}

async function fetchEvents(supa: ReturnType<typeof createClient>): Promise<string> {
  try {
    const { data } = await supa.functions.invoke("economic-calendar", { body: {} });
    const events = (data as any)?.events || [];
    const upcoming = events
      .filter((e: any) => e.impact === "high" || e.importance === 3)
      .slice(0, 8);
    if (!upcoming.length) return "";
    const lines = upcoming.map((e: any) =>
      `• ${e.date || e.time || ""} [${e.country || e.zone || "?"}] ${e.title || e.event}: previsão ${e.forecast || "?"} / anterior ${e.previous || "?"}`
    ).join("\n");
    return `EVENTOS ECONÔMICOS ALTA RELEVÂNCIA (próximos):\n${lines}`;
  } catch { return ""; }
}

async function fetchDividends(supa: ReturnType<typeof createClient>, userId: string): Promise<string> {
  try {
    const { data } = await supa.functions.invoke("dividends", { body: { userId, upcoming: true } });
    const divs = (data as any)?.upcoming || (data as any)?.dividends || [];
    if (!divs.length) return "";
    const next30 = divs.slice(0, 10).map((d: any) =>
      `• ${d.ticker}: R$${Number(d.value || d.amount || 0).toFixed(4)}/cota — pagamento ${d.payment_date || d.date}`
    ).join("\n");
    return `PROVENTOS PRÓXIMOS 30 DIAS:\n${next30}`;
  } catch { return ""; }
}

function buildPortfolioBlock(portfolio: any[]): { text: string; metrics: string } {
  if (!portfolio?.length) return { text: "", metrics: "" };
  const totalValue = portfolio.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const totalCost = portfolio.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const totalReturn = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  // Concentração e correlação básica (por tipo/setor)
  const byType: Record<string, number> = {};
  const bySector: Record<string, number> = {};
  const changes: number[] = [];
  for (const a of portfolio) {
    const v = a.currentPrice * a.quantity;
    byType[a.type || "N/A"] = (byType[a.type || "N/A"] || 0) + v;
    bySector[a.sector || "N/A"] = (bySector[a.sector || "N/A"] || 0) + v;
    if (typeof a.change24h === "number") changes.push(a.change24h);
  }
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
  const topSector = Object.entries(bySector).sort((a, b) => b[1] - a[1])[0];
  const topConc = portfolio.slice().sort((a, b) => (b.currentPrice * b.quantity) - (a.currentPrice * a.quantity))[0];
  const avgVol24h = changes.length ? (changes.reduce((s, x) => s + Math.abs(x), 0) / changes.length) : 0;

  const portfolioText = portfolio.map((a: any) => {
    const value = a.currentPrice * a.quantity;
    const cost = a.avgPrice * a.quantity;
    const profitPct = cost > 0 ? ((value - cost) / cost * 100) : 0;
    return `${a.ticker} (${a.type}${a.sector ? "/" + a.sector : ""}): ${a.quantity}un @ PM R$${a.avgPrice?.toFixed(2)} → atual R$${a.currentPrice?.toFixed(2)} (D+0: ${a.change24h?.toFixed(2)}%) | P/L: ${profitPct.toFixed(1)}% | Aloc: ${a.allocation?.toFixed(1)}%`;
  }).join("\n");

  const text = `CARTEIRA (dados reais Yahoo/Brapi):
Patrimônio: R$${totalValue.toFixed(2)} | Custo: R$${totalCost.toFixed(2)} | Retorno acumulado: ${totalReturn.toFixed(2)}%
Ativos:
${portfolioText}
Data: ${new Date().toLocaleDateString("pt-BR")}`;

  const metrics = `MÉTRICAS DA CARTEIRA:
• Concentração top-1: ${topConc?.ticker} (${topConc?.allocation?.toFixed(1)}%)
• Maior exposição por tipo: ${topType?.[0]} (${((topType?.[1] || 0) / totalValue * 100).toFixed(1)}%)
• Maior exposição por setor: ${topSector?.[0]} (${((topSector?.[1] || 0) / totalValue * 100).toFixed(1)}%)
• Volatilidade média 24h: ${avgVol24h.toFixed(2)}%
• Nº de ativos: ${portfolio.length}`;

  return { text, metrics };
}

async function buildContextForType(
  supa: ReturnType<typeof createClient>,
  userId: string,
  analysisType: string | undefined,
): Promise<Ctx> {
  const ctx: Ctx = {};
  const wants = {
    macro: analysisType === "macro-analysis" || analysisType === "portfolio-review" || analysisType === "risk-management",
    events: analysisType === "macro-analysis" || analysisType === "position-trades" || analysisType === "risk-management",
    dividends: analysisType === "buy-sell" || analysisType === "portfolio-review",
    news: false, // reservado — habilita quando quisermos gastar +1 chamada
  };

  const jobs: Promise<void>[] = [];
  if (wants.macro) jobs.push(fetchMacro(supa).then(t => { ctx.macro = t; }));
  if (wants.events) jobs.push(fetchEvents(supa).then(t => { ctx.events = t; }));
  if (wants.dividends) jobs.push(fetchDividends(supa, userId).then(t => { ctx.dividends = t; }));
  await Promise.allSettled(jobs);
  return ctx;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, portfolio, analysisType } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ID do usuário via JWT (para RPCs futuras)
    const auth = req.headers.get("authorization") || "";
    let userId = "";
    try {
      const parts = auth.replace("Bearer ", "").split(".");
      if (parts[1]) userId = JSON.parse(atob(parts[1])).sub || "";
    } catch { /* ignore */ }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── Blocos de contexto ───
    const { text: portfolioText, metrics: metricsText } = buildPortfolioBlock(portfolio || []);
    const ctx = await buildContextForType(supa, userId, analysisType);

    const contextBlocks = [portfolioText, metricsText, ctx.macro, ctx.events, ctx.dividends, ctx.news]
      .filter(Boolean).join("\n\n");

    // ─── Instruções focadas por tipo ───
    const typePrompts: Record<string, string> = {
      "position-trades": `\n\nFOCO: Sugira 3-5 POSITION TRADES concretos. Para cada um: ticker, entrada, stop, alvo, R:R, prazo estimado, gatilho técnico OU fundamentalista, e como o próximo evento macro pode impactar.`,
      "buy-sell": `\n\nFOCO: Diga claramente O QUE COMPRAR (com preço-teto) e O QUE VENDER (com preço-alvo de saída) hoje. Priorize ativos com proventos próximos ou desvio da alocação-alvo.`,
      "portfolio-review": `\n\nFOCO: Revisão completa. Analise concentração (>15% em 1 ativo é risco), correlação por setor, drawdown potencial, sugira rebalanceamento e liste próximos proventos que reforçarão o caixa.`,
      "macro-analysis": `\n\nFOCO: Analise o cenário macro (Selic, IPCA, USD, próximos eventos de alto impacto) e traduza em ação: quais posições reforçar/reduzir, qual setor tende a se beneficiar/sofrer nas próximas 4-8 semanas.`,
      "risk-management": `\n\nFOCO: Mapa de risco. Identifique concentrações perigosas, correlações escondidas, sugira stops percentuais por ativo (ATR de referência) e proteções (venda coberta, hedge cambial, caixa mínimo) considerando eventos macro à frente.`,
    };

    const contextPrompt = SYSTEM_PROMPT
      + (contextBlocks ? `\n\n=== CONTEXTO DE MERCADO E CARTEIRA ===\n${contextBlocks}\n=== FIM DO CONTEXTO ===` : "")
      + (analysisType ? (typePrompts[analysisType] || "") : "");

    const { response, provider } = await callAI({
      messages: [{ role: "system", content: contextPrompt }, ...messages],
      stream: true,
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        const msg = response.status === 429
          ? "⏳ O serviço de IA está temporariamente sobrecarregado. Aguarde alguns segundos e tente novamente."
          : "💳 Créditos de IA insuficientes. Verifique seu plano.";
        const ssePayload = `data: ${JSON.stringify({ choices: [{ delta: { content: msg } }] })}\n\ndata: [DONE]\n\n`;
        return new Response(ssePayload, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider } });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      const errPayload = `data: ${JSON.stringify({ choices: [{ delta: { content: "❌ Erro no serviço de IA. Tente novamente em instantes." } }] })}\n\ndata: [DONE]\n\n`;
      return new Response(errPayload, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "x-ai-provider": provider },
    });
  } catch (err) {
    console.error("ai-trader error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
