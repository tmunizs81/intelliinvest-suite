const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  if (GEMINI_API_KEY) {
    const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok || resp.status === 402) return resp;
    if (resp.status !== 429 && resp.status < 500) return resp;
    console.warn(`Gemini failed (${resp.status}), trying DeepSeek fallback...`);
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
    const { tickers, assets } = await req.json();
    const assetsInfo = (assets || []).map((a: any) =>
      `${a.ticker} (${a.name}): Preço atual R$${a.currentPrice?.toFixed(2)}, variação 24h: ${a.change24h?.toFixed(2)}%`
    ).join('\n');

    const response = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `Você é um analista técnico especializado em padrões gráficos do mercado financeiro.
Analise os ativos fornecidos e identifique padrões gráficos prováveis baseando-se no preço atual e variação recente.
Considere padrões como: OCO, OCO Invertido, Triângulo Ascendente/Descendente/Simétrico, Bandeira de Alta/Baixa, 
Canal de Alta/Baixa, Cunha, Retângulo, Topo/Fundo Duplo, Cup and Handle, Suporte/Resistência.
SEMPRE identifique pelo menos 3 padrões mesmo que com confiabilidade baixa. Use a ferramenta para retornar o resultado.`,
        },
        { role: "user", content: `Identifique padrões gráficos para estes ativos:\n${assetsInfo}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_patterns",
          description: "Report detected chart patterns",
          parameters: {
            type: "object",
            properties: {
              patterns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    ticker: { type: "string" },
                    pattern: { type: "string", description: "Nome do padrão gráfico" },
                    type: { type: "string", enum: ["bullish", "bearish", "neutral"] },
                    reliability: { type: "string", enum: ["Alta", "Média", "Baixa"] },
                    description: { type: "string", description: "Breve explicação do padrão" },
                    target: { type: "string", description: "Preço alvo estimado, ex: R$35.50" },
                  },
                  required: ["ticker", "pattern", "type", "reliability", "description"],
                  additionalProperties: false,
                },
              },
            },
            required: ["patterns"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_patterns" } },
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    
    // Try tool_calls first
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {}
    }

    // Fallback: parse content
    const content = aiData.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { patterns: [] };
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("pattern-detector error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
