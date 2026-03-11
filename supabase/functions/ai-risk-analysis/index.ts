

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assets } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const portfolioData = (assets || []).map((a: any) => ({
      ticker: a.ticker,
      type: a.type,
      sector: a.sector,
      allocation: a.allocation,
      quantity: a.quantity,
      avgPrice: a.avgPrice,
      currentPrice: a.currentPrice,
      change24h: a.change24h,
      profit: ((a.currentPrice - a.avgPrice) / a.avgPrice * 100).toFixed(2),
    }));

    const typeDistribution: Record<string, number> = {};
    const sectorDistribution: Record<string, number> = {};
    (assets || []).forEach((a: any) => {
      typeDistribution[a.type] = (typeDistribution[a.type] || 0) + a.allocation;
      const sector = a.sector || 'Não classificado';
      sectorDistribution[sector] = (sectorDistribution[sector] || 0) + a.allocation;
    });

    const systemPrompt = `Você é um especialista em gestão de risco de carteiras de investimento no mercado brasileiro.

Analise a carteira e retorne um JSON com a seguinte estrutura (SEM markdown, apenas JSON puro):
{
  "riskScore": <número de 1 a 10, onde 10 = muito arriscado>,
  "riskLevel": "<Conservador|Moderado|Arrojado|Agressivo>",
  "concentrationRisk": "<Baixo|Médio|Alto|Crítico>",
  "diversificationScore": <número de 1 a 10>,
  "topRisks": [
    { "risk": "<descrição curta>", "severity": "<alta|média|baixa>", "mitigation": "<sugestão>" }
  ],
  "suggestions": ["<sugestão 1>", "<sugestão 2>", "<sugestão 3>"],
  "summary": "<resumo em 2-3 frases>"
}

CARTEIRA:
${JSON.stringify(portfolioData, null, 2)}

DISTRIBUIÇÃO POR TIPO:
${JSON.stringify(typeDistribution)}

DISTRIBUIÇÃO POR SETOR:
${JSON.stringify(sectorDistribution)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Analise o risco desta carteira e retorne o JSON." },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let riskAnalysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      riskAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to parse" };
    } catch {
      riskAnalysis = { summary: content, riskScore: 5, riskLevel: "Moderado" };
    }

    return new Response(
      JSON.stringify(riskAnalysis),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-risk-analysis error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
