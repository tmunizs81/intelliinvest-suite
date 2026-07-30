import { requireCaller } from "../_shared/auth.ts";
// AI Tax Chat - Q&A conversacional sobre IRPF de investimentos
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const userCalls = new Map<string, number[]>();
function checkRateLimit(req: Request): Response | null {
  const auth = req.headers.get("authorization") || "";
  const parts = auth.replace("Bearer ", "").split(".");
  let uid = "anon";
  try { if (parts[1]) uid = JSON.parse(atob(parts[1])).sub || "anon"; } catch {}
  const now = Date.now();
  const calls = (userCalls.get(uid) || []).filter(t => now - t < 60000);
  if (calls.length >= 20) {
    return new Response(JSON.stringify({ error: "Rate limit: 20/min" }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  calls.push(now); userCalls.set(uid, calls);
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Somente sessão válida (ou chamada interna cron/service): evita uso do endpoint
  // como proxy gratuito de LLM e vazamento de dados entre contas.
  const denied = await requireCaller(req);
  if (denied) return denied;
  const rl = checkRateLimit(req); if (rl) return rl;

  try {
    const { messages, context } = await req.json();
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    if (!DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY não configurada");

    const systemPrompt = `Você é um assistente contábil especializado em IRPF de investimentos no Brasil. Responda de forma OBJETIVA, PRECISA e citando a legislação quando relevante (IN RFB 1585/2015, Lei 11.033/2004, IN 1888/2019 para cripto etc).

REGRAS:
- Ações: 15% swing / 20% day trade. Isenção swing ≤ R$20k/mês.
- FIIs: 20% ganho de capital, sem isenção. Dividendos isentos (Lei 11.033).
- ETFs: 15%, sem isenção.
- Cripto: 15% ganho. Isenção ≤ R$35k/mês (total, não por tipo).
- LCI/LCA/Poupança: isentos IR.
- CDB/RDB: tabela regressiva 22,5% a 15% na fonte.
- JCP: 15% na fonte (tributação exclusiva).
- Prejuízos: compensáveis dentro do mesmo tipo (Ações c/ Ações), sem prazo.
- Day trade e swing NÃO compensam entre si.

${context ? `\n**CONTEXTO DA CARTEIRA DO USUÁRIO:**\n${context}\n` : ''}

Use Markdown. Máximo 6 parágrafos. Se a pergunta não é sobre IRPF/investimentos, redirecione educadamente.`;

    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || []),
        ],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Rate limit" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error ${resp.status}`);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
