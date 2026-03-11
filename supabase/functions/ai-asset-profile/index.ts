import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUA() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": randomUA(),
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    // Strip to text
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 15000);
  } catch (err) {
    console.warn(`fetchPageText failed for ${url}:`, err);
    return null;
  }
}

function getAssetCategory(ticker: string, type?: string): string {
  if (type === "FII") return "fii";
  if (type === "ETF") return "etf";
  if (type === "BDR") return "bdr";
  const t = ticker.toUpperCase();
  if (/^[A-Z]{4}11$/.test(t)) return "fii";
  if (/^[A-Z]{4}(34|35|39)$/.test(t)) return "bdr";
  if (/^[A-Z]{4}\d{1,2}$/.test(t)) return "stock";
  return "international";
}

function getScrapingUrls(ticker: string, category: string): string[] {
  const t = ticker.toLowerCase();
  const urls: string[] = [];

  if (category === "fii") {
    urls.push(`https://investidor10.com.br/fiis/${t}/`);
    urls.push(`https://statusinvest.com.br/fundos-imobiliarios/${t}`);
  } else if (category === "stock") {
    urls.push(`https://investidor10.com.br/acoes/${t}/`);
    urls.push(`https://statusinvest.com.br/acoes/${t}`);
  } else if (category === "etf") {
    urls.push(`https://investidor10.com.br/etfs/${t}/`);
    urls.push(`https://statusinvest.com.br/etfs/${t}`);
  } else if (category === "bdr") {
    urls.push(`https://investidor10.com.br/bdrs/${t}/`);
    urls.push(`https://statusinvest.com.br/bdrs/${t}`);
  }
  // For "international" category (crypto, foreign stocks), no Brazilian scraping sources

  return urls;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { ticker, type, name } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const category = getAssetCategory(ticker, type);
    const urls = getScrapingUrls(ticker, category);

    console.log(`Fetching asset profile for ${ticker} (${category}), scraping ${urls.length} sources`);

    // Scrape pages in parallel
    const pageTexts = await Promise.all(urls.map((url) => fetchPageText(url)));
    const scrapedContent = pageTexts
      .filter(Boolean)
      .map((text, i) => `[Fonte ${i + 1}: ${urls[i]}]\n${text!.substring(0, 7000)}`)
      .join("\n\n---\n\n");

    const prompt = `Gere um resumo completo e detalhado sobre o ativo ${ticker} (${name || ticker}, tipo: ${type || category}).

${scrapedContent ? `Dados coletados de fontes brasileiras:\n${scrapedContent}\n\n` : ""}

Use a ferramenta para retornar o resultado estruturado. Preencha TODOS os campos com as informações disponíveis. Se não houver informação, coloque null.

Para o campo "sections", crie seções relevantes conforme o tipo de ativo:
- FII: Estratégia, Composição da Carteira, Diversificação, Estrutura e Taxas, Distribuição de Rendimentos
- Ação: Sobre a Empresa, Segmentos de Negócio, Posição no Mercado, Governança, Riscos e Oportunidades
- ETF: Estratégia do Fundo, Composição, Metodologia do Índice, Custos, Exposição
- BDR: Empresa Original, Negócios Principais, Presença Global, Estrutura do BDR

Para "key_assets", liste os principais ativos/imóveis/subsidiárias/holdings que compõem o fundo ou empresa.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um analista financeiro especializado no mercado brasileiro. Gere resumos completos e profissionais sobre ativos, similares aos encontrados no Investidor10 e StatusInvest. Use dados reais quando disponíveis nas fontes. Seja detalhado e informativo.",
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_asset_profile",
              description: "Generate a structured asset profile summary",
              parameters: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description: "Parágrafo introdutório sobre o ativo (2-4 frases)",
                  },
                  administrator: { type: "string", description: "Administrador/gestora (se aplicável)" },
                  manager: { type: "string", description: "Gestor (se aplicável)" },
                  segment: { type: "string", description: "Segmento/setor de atuação" },
                  classification: { type: "string", description: "Classificação (ex: Híbrido, Tijolo, Growth, etc.)" },
                  listing_date: { type: "string", description: "Data de listagem/IPO" },
                  admin_fee: { type: "string", description: "Taxa de administração" },
                  performance_fee: { type: "string", description: "Taxa de performance" },
                  ticker_exchange: { type: "string", description: "Bolsa onde é negociado (B3, NYSE, etc.)" },
                  sections: {
                    type: "array",
                    description: "Seções detalhadas do resumo",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        content: { type: "string", description: "Texto em markdown com detalhes" },
                      },
                      required: ["title", "content"],
                      additionalProperties: false,
                    },
                  },
                  key_assets: {
                    type: "array",
                    description: "Principais ativos/imóveis/subsidiárias que compõem o fundo ou empresa",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        location: { type: "string" },
                        type: { type: "string", description: "Tipo (Escritório, Galpão, Subsidiária, etc.)" },
                      },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                  risks: {
                    type: "array",
                    description: "Principais riscos",
                    items: { type: "string" },
                  },
                  highlights: {
                    type: "array",
                    description: "Destaques positivos",
                    items: { type: "string" },
                  },
                },
                required: ["description", "sections"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_asset_profile" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response from AI");

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-asset-profile error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
