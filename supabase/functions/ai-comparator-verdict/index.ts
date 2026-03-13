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
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "gemini-2.5-flash" }),
    });
    if (resp.ok) return resp;
    console.warn(`Gemini failed (${resp.status}), trying Groq fallback...`);
    try { await resp.text(); } catch {}
  }

  if (!GROQ_API_KEY) throw new Error("No AI provider available");
  console.log("Using Groq fallback");
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "llama-3.3-70b-versatile" }),
  });
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const { assets } = await req.json();
    if (!assets || assets.length < 2) return new Response(JSON.stringify({ error: "Mínimo 2 ativos" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const assetsDescription = assets.map((a: any, i: number) => {
      let desc = `## Ativo ${i + 1}: ${a.ticker} (${a.name})\n- Tipo: ${a.type}\n- Preço atual: R$ ${a.currentPrice?.toFixed(2) || 'N/A'}\n- Variação 24h: ${a.change24h?.toFixed(2) || 0}%\n`;
      if (a.aiSignal) { desc += `- Sinal IA: ${a.aiSignal.recommendation} (confiança ${a.aiSignal.confidence}%)\n`; }
      if (a.indicators) { desc += `- RSI: ${a.indicators.rsi?.toFixed(1)}\n`; }
      if (a.fundamentals?.pe) desc += `- P/L: ${Number(a.fundamentals.pe).toFixed(1)}\n`;
      if (a.dividendYield) desc += `- Dividend Yield: ${a.dividendYield.toFixed(2)}%\n`;
      return desc;
    }).join("\n");

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um analista de investimentos brasileiro. Determine o VENCEDOR da comparação. Responda em português." },
        { role: "user", content: `Compare os seguintes ativos e determine o vencedor:\n\n${assetsDescription}` },
      ],
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const verdict = data.choices?.[0]?.message?.content || "Não foi possível gerar o veredito.";
    return new Response(JSON.stringify({ verdict }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-comparator-verdict error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
