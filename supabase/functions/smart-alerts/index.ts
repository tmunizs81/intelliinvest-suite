import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { portfolio } = await req.json();
    if (!portfolio?.length) {
      return new Response(JSON.stringify({ error: "portfolio required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalValue = portfolio.reduce((s: number, a: any) => s + (a.currentPrice * a.quantity), 0);
    const portfolioText = portfolio.map((a: any) => {
      const value = a.currentPrice * a.quantity;
      const cost = a.avgPrice * a.quantity;
      const profitPct = cost > 0 ? ((value - cost) / cost * 100) : 0;
      return `${a.ticker} (${a.type}, ${a.sector || 'N/A'}): Atual R$${a.currentPrice?.toFixed(2)}, Var24h: ${a.change24h?.toFixed(2)}%, P/L: ${profitPct.toFixed(1)}%, Alocação: ${a.allocation?.toFixed(1)}%`;
    }).join("\n");

    const prompt = `Analise esta carteira e identifique padrões inteligentes que merecem alertas proativos:

Patrimônio: R$${totalValue.toFixed(2)} | ${portfolio.length} ativos
${portfolioText}
Data: ${new Date().toLocaleDateString('pt-BR')}

Detecte:
1. Quedas incomuns (variações muito acima da média)
2. Concentração excessiva (ativo com alocação desproporcional)
3. Divergência entre ativos correlacionados
4. Ativos com lucro significativo para realização parcial
5. Ativos com prejuízo que podem precisar de stop
6. Oportunidades de compra por queda técnica

Use a ferramenta para retornar alertas estruturados.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Você é um sistema de alertas inteligentes para investidores brasileiros. Detecte padrões e anomalias na carteira e gere alertas proativos acionáveis. Seja preciso e use dados concretos." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_smart_alerts",
            description: "Return smart alerts for the portfolio",
            parameters: {
              type: "object",
              properties: {
                alerts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["unusual_drop", "concentration", "divergence", "take_profit", "stop_loss", "opportunity", "volume", "pattern"] },
                      severity: { type: "string", enum: ["critical", "warning", "info"] },
                      title: { type: "string", description: "Short alert title (max 50 chars)" },
                      description: { type: "string", description: "Detailed explanation with action (max 150 chars)" },
                      ticker: { type: "string", description: "Related ticker if applicable" },
                      action: { type: "string", description: "Suggested action: buy, sell, hold, monitor, hedge" },
                    },
                    required: ["type", "severity", "title", "description", "action"],
                    additionalProperties: false,
                  },
                },
                summary: { type: "string", description: "One-line overall risk assessment (max 80 chars)" },
              },
              required: ["alerts", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_smart_alerts" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Créditos insuficientes." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("smart-alerts error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
