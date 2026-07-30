import { resolveCaller } from "../_shared/auth.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "x-ai-provider",
};

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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Somente sessão válida (ou chamada interna cron/service): evita uso do endpoint
  // como proxy gratuito de LLM e vazamento de dados entre contas.
  // Identidade verificada (assinatura + expiração) e cota persistida no Postgres:
  // o Map em memória anterior valia por isolate e a chave vinha de atob(jwt).
  const caller = await resolveCaller(req);
  if (caller instanceof Response) return caller;

  if (!caller.isInternal) {
    const limited = await enforceRateLimit(req, caller.subjectId, {
      resource: "ai-comparator-verdict", max: 10, windowSeconds: 60,
    });
    if (limited) return limited;
  }


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

    const { response, provider } = await callAI({
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
    return new Response(JSON.stringify({ verdict }), { headers: { ...corsHeaders, "Content-Type": "application/json", "x-ai-provider": provider } });
  } catch (e) {
    console.error("ai-comparator-verdict error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
