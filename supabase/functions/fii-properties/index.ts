const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// In-memory cache: 10min TTL
const cache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

interface Property {
  name: string;
  state: string;
  city?: string;
  type?: string;
  area_m2?: number;
  address?: string;
}

function parseBrNumber(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[R$%\s]/g, '').trim();
  if (!cleaned || cleaned === '-') return null;
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || null;
  }
  return parseFloat(cleaned) || null;
}

// Try to parse properties directly from StatusInvest HTML (no AI needed)
function parsePropertiesFromHtml(html: string, ticker: string): string | null {
  // StatusInvest has a portfolio section with property cards
  // Look for property data in the HTML structure
  const properties: Property[] = [];
  
  // Pattern: property names appear in portfolio section
  // Look for patterns like location names + state abbreviations
  const portfolioIdx = html.indexOf('portfolio-section');
  if (portfolioIdx === -1) {
    // Try alternate section markers
    const altIdx = html.indexOf('PORTFÓLIO');
    if (altIdx === -1) return null;
  }

  // Extract from table rows or card structures
  // StatusInvest uses data attributes and tables for portfolio
  // Look for property entries with state codes
  const stateRegex = /(?:class="[^"]*"[^>]*>)\s*([A-Z][a-záéíóúãõ\s\-\.]+(?:Shopping|Logíst|Galpão|Centro|Park|Mall|Tower|Office|Business|Plaza|Outlet|Industrial|Distribui)[A-Za-záéíóúãõ\s\-\.]*)\s*<[\s\S]{0,300}?(?:>|\b)(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?:\b|<)/gi;
  
  let match;
  const seen = new Set<string>();
  while ((match = stateRegex.exec(html)) !== null && properties.length < 50) {
    const name = match[1].trim();
    if (name.length < 3 || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    properties.push({ name, state: match[2].toUpperCase() });
  }

  if (properties.length >= 3) {
    const result = {
      fund_name: ticker.toUpperCase(),
      total_properties: properties.length,
      properties,
    };
    return JSON.stringify(result);
  }
  return null;
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

function extractRelevantText(html: string): string {
  // Strip scripts/styles, keep only text, limit to relevant sections
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 10000);
}

async function callAI(body: any): Promise<{ response: Response; provider: string }> {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (DEEPSEEK_API_KEY) {
    try {
      const { model, ...rest } = body;
      const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...rest, model: "deepseek-chat" }),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) return { response: resp, provider: "deepseek" };
    } catch { /* fallback */ }
  }
  if (!LOVABLE_API_KEY) throw new Error("No AI provider available");
  const { model, ...rest } = body;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...rest, model: model?.startsWith("google/") ? model : `google/${model || "gemini-2.5-flash"}` }),
    signal: AbortSignal.timeout(10000),
  });
  return { response: resp, provider: "lovable" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const t = ticker.toLowerCase();

    // Check cache first
    const cached = cache.get(t);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(cached.data, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch both sources in parallel with tight timeouts
    const [inv10Html, statusHtml] = await Promise.all([
      fetchHtml(`https://investidor10.com.br/fiis/${t}/`, 4000),
      fetchHtml(`https://statusinvest.com.br/fundos-imobiliarios/${t}`, 4000),
    ]);

    // Try direct HTML parsing first (fastest path, no AI needed)
    const combinedHtml = (inv10Html || '') + (statusHtml || '');
    if (combinedHtml.length > 1000) {
      const directResult = parsePropertiesFromHtml(combinedHtml, ticker);
      if (directResult) {
        cache.set(t, { data: directResult, ts: Date.now() });
        return new Response(directResult, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Fallback: use AI to extract from text
    const texts = [
      inv10Html ? `[Investidor10]\n${extractRelevantText(inv10Html)}` : null,
      statusHtml ? `[StatusInvest]\n${extractRelevantText(statusHtml)}` : null,
    ].filter(Boolean).join("\n---\n");

    if (!texts) {
      return new Response(JSON.stringify({ error: "Não foi possível coletar dados" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { response } = await callAI({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "Extraia a lista de imóveis do FII de forma rápida e precisa." },
        { role: "user", content: `Extraia os imóveis do FII ${ticker.toUpperCase()}:\n${texts}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_properties",
          description: "Extract FII property list",
          parameters: {
            type: "object",
            properties: {
              fund_name: { type: "string" },
              total_properties: { type: "number" },
              total_area: { type: "number" },
              properties: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    state: { type: "string" },
                    city: { type: "string" },
                    type: { type: "string" },
                    area_m2: { type: "number" },
                    address: { type: "string" },
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
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("No structured response");

    const resultStr = toolCall.function.arguments;
    cache.set(t, { data: resultStr, ts: Date.now() });
    return new Response(resultStr, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("fii-properties error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
