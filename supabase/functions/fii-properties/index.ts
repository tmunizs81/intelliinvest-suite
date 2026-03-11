import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(12000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 20000);
  } catch (err) {
    console.warn(`fetchPageText failed: ${url}`, err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { ticker } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const t = ticker.toLowerCase();
    const [inv10Text, statusText] = await Promise.all([
      fetchPageText(`https://investidor10.com.br/fiis/${t}/`),
      fetchPageText(`https://statusinvest.com.br/fundos-imobiliarios/${t}`),
    ]);

    const scrapedContent = [
      inv10Text ? `[Investidor10]\n${inv10Text}` : null,
      statusText ? `[StatusInvest]\n${statusText}` : null,
    ].filter(Boolean).join("\n\n---\n\n");

    if (!scrapedContent) {
      return new Response(JSON.stringify({ error: "Não foi possível coletar dados das fontes" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Analise os dados coletados do FII ${ticker.toUpperCase()} e extraia a lista completa de imóveis/propriedades que compõem o fundo.

DADOS COLETADOS:
${scrapedContent}

Use a ferramenta para retornar a lista de imóveis estruturada. Para cada imóvel inclua:
- Nome do imóvel/empreendimento
- Estado (UF)
- Cidade
- Tipo (Galpão Logístico, Laje Corporativa, Shopping, Hospital, Educacional, etc.)
- Área bruta locável em m² (se disponível)
- Endereço ou localização (se disponível)

Extraia TODOS os imóveis mencionados. Se a área não estiver disponível, coloque null.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você extrai dados estruturados de imóveis de FIIs a partir de textos coletados de portais financeiros brasileiros. Seja preciso e extraia todos os imóveis mencionados." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_properties",
            description: "Extract structured FII property list",
            parameters: {
              type: "object",
              properties: {
                fund_name: { type: "string", description: "Nome completo do fundo" },
                total_properties: { type: "number", description: "Total de imóveis" },
                total_area: { type: "number", description: "Área total bruta locável em m² (se disponível)" },
                properties: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Nome do imóvel" },
                      state: { type: "string", description: "Sigla do estado (SP, RJ, MG...)" },
                      city: { type: "string", description: "Cidade" },
                      type: { type: "string", description: "Tipo do imóvel" },
                      area_m2: { type: "number", description: "Área bruta locável em m²" },
                      address: { type: "string", description: "Endereço ou localização" },
                    },
                    required: ["name", "state"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["fund_name", "properties"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_properties" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    return new Response(toolCall.function.arguments, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("fii-properties error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
