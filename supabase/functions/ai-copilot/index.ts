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

const AI_TIMEOUT_MS = 12000;

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
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (resp.ok || resp.status === 402) return resp;
      if (resp.status !== 429 && resp.status < 500) return resp;
      console.warn(`Lovable AI failed (${resp.status}), trying DeepSeek fallback...`);
      try { await resp.text(); } catch {}
    } catch (err) {
      console.warn("Lovable AI request failed, trying fallback:", err);
    }
  }

  if (!DEEPSEEK_API_KEY) {
    throw new Error("A análise de IA demorou para responder. Tente novamente em instantes.");
  }

  console.log("Using DeepSeek fallback");
  try {
    return await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "deepseek-chat" }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (err) {
    console.error("DeepSeek fallback failed:", err);
    throw new Error("A análise de IA demorou para responder. Tente novamente.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const rateLimited = checkRateLimit(req);
  if (rateLimited) return rateLimited;

  try {
    const { ticker, name, type, quantity, avgPrice, currentPrice, operation, portfolio } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const operationValue = (quantity || 0) * (avgPrice || currentPrice || 0);
    let portfolioContext = "";
    if (portfolio?.length) {
      const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
      portfolioContext = `\nCarteira atual: R$${totalValue.toFixed(2)} em ${portfolio.length} ativos.`;
      const existing = portfolio.find((a: any) => a.ticker === ticker);
      if (existing) {
        portfolioContext += `\nJá possui ${existing.quantity}un de ${ticker} a PM R$${existing.avgPrice.toFixed(2)}, atual R$${existing.currentPrice.toFixed(2)}.`;
        portfolioContext += ` Alocação atual: ${existing.allocation?.toFixed(1)}%.`;
      }
    }

    const prompt = `Analise esta operação e dê um sinal rápido:

Operação: ${operation || 'COMPRA'} de ${quantity || '?'}un de ${ticker} (${name || type || ''}) a R$${(avgPrice || 0).toFixed(2)}
Preço atual de mercado: R$${(currentPrice || 0).toFixed(2)}
Valor da operação: R$${operationValue.toFixed(2)}
${portfolioContext}

Avalie: preço vs média, momento do ativo, impacto na diversificação, e dê um veredito.

Responda APENAS com JSON válido neste formato exato:
{
  "signal": "green" ou "yellow" ou "red",
  "title": "veredito em até 60 caracteres",
  "reasons": ["razão 1", "razão 2"],
  "suggestion": "sugestão acionável em até 120 caracteres",
  "confidence": 7
}`;

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Você é um copilot de investimentos. Analise operações e dê sinais rápidos: verde (favorável), amarelo (atenção), vermelho (desfavorável). Responda APENAS com JSON válido, sem markdown." },
        { role: "user", content: prompt },
      ],
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No structured response from AI");
    const result = JSON.parse(jsonMatch[0]);

    if (!result.signal || !result.title) throw new Error("Invalid AI response structure");

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("ai-copilot error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
