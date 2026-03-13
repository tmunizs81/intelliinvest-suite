const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const { assets, year } = await req.json();

    const assetsInfo = (assets || []).map((a: any) =>
      `${a.ticker} (${a.name}): Tipo=${a.type}, Qtd=${a.quantity}, PM=R$${a.avgPrice?.toFixed(2)}, Atual=R$${a.currentPrice?.toFixed(2)}`
    ).join('\n');

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você é um contador especializado em imposto de renda de investimentos no Brasil. Gere um guia passo-a-passo personalizado para declarar os investimentos abaixo no IRPF ${year}.

Inclua:
1. Quais fichas do programa IRPF usar
2. Códigos de bens corretos
3. Como declarar cada ativo
4. Isenções (vendas até R$20k/mês para ações)
5. Day trade vs swing trade
6. Compensação de prejuízos
7. FIIs (rendimentos isentos vs ganho de capital)
8. Cripto (código 89)
9. Renda Fixa
10. ETFs internacionais

Responda em Markdown formatado.`,
        },
        { role: "user", content: `Gere o guia de declaração IRPF ${year} para esta carteira:\n${assetsInfo}` },
      ],
      max_tokens: 2000,
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const guide = aiData.choices?.[0]?.message?.content || "Erro ao gerar guia.";

    return new Response(JSON.stringify({ guide }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
