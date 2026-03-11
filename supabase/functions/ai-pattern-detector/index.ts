

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const { tickers, assets } = await req.json();

    const assetsInfo = (assets || []).map((a: any) => `${a.ticker} (${a.name}): R$${a.currentPrice?.toFixed(2)}, variação ${a.change24h?.toFixed(2)}%`).join('\n');

    const aiResp = await fetch("https://ai-gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um analista técnico especializado em padrões gráficos. Analise os ativos abaixo e identifique possíveis padrões gráficos (ex: Ombro-Cabeça-Ombro, Triângulo Ascendente/Descendente, Bandeira, Cunha, Duplo Topo/Fundo, Suporte/Resistência, Canal, Cup and Handle, etc).

Para cada padrão encontrado, retorne JSON no formato:
{
  "patterns": [
    {
      "ticker": "PETR4",
      "pattern": "Triângulo Ascendente",
      "type": "bullish" | "bearish" | "neutral",
      "reliability": "Alta" | "Média" | "Baixa",
      "description": "Descrição do padrão e implicações",
      "target": "R$XX.XX (opcional)"
    }
  ]
}

Retorne apenas o JSON, sem markdown.`,
          },
          { role: "user", content: `Analise padrões gráficos para:\n${assetsInfo}` },
        ],
        max_tokens: 800,
      }),
    });

    const aiData = await aiResp.json();
    const content = aiData.choices?.[0]?.message?.content || "{}";
    
    let parsed;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { patterns: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
