const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

async function callAI(body: any): Promise<Response> {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const { assets } = await req.json();

    const portfolioData = (assets || []).map((a: any) => ({
      ticker: a.ticker, type: a.type, sector: a.sector, allocation: a.allocation,
      quantity: a.quantity, avgPrice: a.avgPrice, currentPrice: a.currentPrice, change24h: a.change24h,
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

Analise a carteira e retorne um JSON com:
{
  "riskScore": <1-10>,
  "riskLevel": "<Conservador|Moderado|Arrojado|Agressivo>",
  "concentrationRisk": "<Baixo|Médio|Alto|Crítico>",
  "diversificationScore": <1-10>,
  "topRisks": [{ "risk": "", "severity": "alta|média|baixa", "mitigation": "" }],
  "suggestions": ["..."],
  "summary": "resumo em 2-3 frases"
}

CARTEIRA:
${JSON.stringify(portfolioData, null, 2)}

DISTRIBUIÇÃO POR TIPO: ${JSON.stringify(typeDistribution)}
DISTRIBUIÇÃO POR SETOR: ${JSON.stringify(sectorDistribution)}`;

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Analise o risco desta carteira e retorne o JSON." },
      ],
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let riskAnalysis;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      riskAnalysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to parse" };
    } catch { riskAnalysis = { summary: content, riskScore: 5, riskLevel: "Moderado" }; }

    return new Response(JSON.stringify(riskAnalysis), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-risk-analysis error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
