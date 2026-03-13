const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UAs = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

// In-memory cache: 15min TTL
const cache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

interface Property {
  name: string;
  state: string;
  city?: string;
  type?: string;
}

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": UAs[Math.floor(Math.random() * UAs.length)],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    console.warn(`Fetch failed for ${url}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// Parse properties from Investidor10 HTML
function parseInvestidor10(html: string): Property[] {
  const properties: Property[] = [];
  const seen = new Set<string>();

  // Investidor10 has property cards with names and locations
  // Try multiple patterns
  
  // Pattern 1: Table rows with property data
  const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const col1 = m[1].replace(/<[^>]+>/g, '').trim();
    const col2 = m[2].replace(/<[^>]+>/g, '').trim();
    // Check if col2 looks like a state code
    if (/^[A-Z]{2}$/.test(col2) && col1.length > 2 && !seen.has(col1.toLowerCase())) {
      seen.add(col1.toLowerCase());
      properties.push({ name: col1, state: col2 });
    }
  }

  // Pattern 2: Look for property names near state codes in any context
  const statePattern = /([A-ZÀ-Úa-zà-ú][A-Za-zÀ-Úà-ú\s\-\.\/]{3,60})\s*(?:[-–|,]|<[^>]*>)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g;
  while ((m = statePattern.exec(html)) !== null && properties.length < 80) {
    const name = m[1].replace(/<[^>]+>/g, '').trim();
    if (name.length >= 3 && name.length <= 80 && !seen.has(name.toLowerCase())) {
      // Filter out generic HTML/CSS terms
      if (/^(class|style|width|height|div|span|table|img|src|href|data|font|color|border|padding|margin|display|position|text|align|center|right|left)$/i.test(name)) continue;
      seen.add(name.toLowerCase());
      properties.push({ name, state: m[2].toUpperCase() });
    }
  }

  return properties;
}

// Parse properties from StatusInvest HTML
function parseStatusInvest(html: string): Property[] {
  const properties: Property[] = [];
  const seen = new Set<string>();

  // StatusInvest portfolio section
  // Look for location data with state codes
  const patterns = [
    // Card-based: property name followed by location
    /(?:title|alt|name|label)[^>]*>([^<]{3,60})<[\s\S]{0,200}?\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/gi,
    // Direct text patterns
    />\s*([A-ZÀ-Ú][A-Za-zÀ-Úà-ú\s\-\.\/]{3,60})\s*[-–,]\s*([A-Z]{2})\s*</g,
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(html)) !== null && properties.length < 80) {
      const name = m[1].replace(/<[^>]+>/g, '').trim();
      const state = m[2].toUpperCase();
      if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(state)) continue;
      if (name.length >= 3 && !seen.has(name.toLowerCase())) {
        if (/^(class|style|width|height|div|span|table)$/i.test(name)) continue;
        seen.add(name.toLowerCase());
        properties.push({ name, state });
      }
    }
  }

  return properties;
}

// Use FundsExplorer as additional source
async function tryFundsExplorer(ticker: string): Promise<Property[]> {
  const html = await fetchHtml(`https://www.fundsexplorer.com.br/funds/${ticker.toLowerCase()}`, 12000);
  if (!html) return [];
  
  const properties: Property[] = [];
  const seen = new Set<string>();
  
  // FundsExplorer lists properties with state
  const regex = />\s*([A-ZÀ-Ú][A-Za-zÀ-Úà-ú\s\-\.\/]{3,60})\s*[-–,]\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\s*</g;
  let m;
  while ((m = regex.exec(html)) !== null && properties.length < 80) {
    const name = m[1].trim();
    if (name.length >= 3 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      properties.push({ name, state: m[2].toUpperCase() });
    }
  }
  
  return properties;
}

// AI fallback - only if we have HTML text but couldn't parse
async function tryAIExtraction(text: string, ticker: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || text.length < 500) return null;

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Extraia APENAS a lista de imóveis/propriedades do FII. Responda em JSON com fund_name, total_properties e properties (array com name e state)." },
          { role: "user", content: `FII ${ticker}. Texto:\n${text.substring(0, 6000)}` },
        ],
        max_tokens: 2000,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    // Validate it's valid JSON with properties
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.properties && Array.isArray(parsed.properties) && parsed.properties.length > 0) {
      return JSON.stringify(parsed);
    }
    return null;
  } catch (e) {
    console.warn("AI extraction failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    if (!ticker) return new Response(JSON.stringify({ error: "ticker required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const t = ticker.toLowerCase();

    // Check cache
    const cached = cache.get(t);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(cached.data, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let allProperties: Property[] = [];
    let rawText = "";

    // Try sources sequentially to avoid resource exhaustion
    // Source 1: Investidor10
    console.log(`Fetching properties for ${ticker} from Investidor10...`);
    const inv10Html = await fetchHtml(`https://investidor10.com.br/fiis/${t}/`);
    if (inv10Html) {
      const props = parseInvestidor10(inv10Html);
      console.log(`Investidor10: found ${props.length} properties`);
      allProperties.push(...props);
      rawText += stripHtml(inv10Html).substring(0, 5000);
    }

    // Source 2: StatusInvest (only if we need more)
    if (allProperties.length < 3) {
      console.log(`Fetching from StatusInvest...`);
      const statusHtml = await fetchHtml(`https://statusinvest.com.br/fundos-imobiliarios/${t}`);
      if (statusHtml) {
        const props = parseStatusInvest(statusHtml);
        console.log(`StatusInvest: found ${props.length} properties`);
        // Merge without duplicates
        const existing = new Set(allProperties.map(p => p.name.toLowerCase()));
        for (const p of props) {
          if (!existing.has(p.name.toLowerCase())) {
            allProperties.push(p);
            existing.add(p.name.toLowerCase());
          }
        }
        rawText += "\n" + stripHtml(statusHtml).substring(0, 5000);
      }
    }

    // Source 3: FundsExplorer (only if still need more)
    if (allProperties.length < 3) {
      console.log(`Fetching from FundsExplorer...`);
      const feProps = await tryFundsExplorer(ticker);
      console.log(`FundsExplorer: found ${feProps.length} properties`);
      const existing = new Set(allProperties.map(p => p.name.toLowerCase()));
      for (const p of feProps) {
        if (!existing.has(p.name.toLowerCase())) {
          allProperties.push(p);
          existing.add(p.name.toLowerCase());
        }
      }
    }

    // If direct parsing found properties, return them
    if (allProperties.length >= 1) {
      const result = JSON.stringify({
        fund_name: ticker.toUpperCase(),
        total_properties: allProperties.length,
        properties: allProperties,
      });
      cache.set(t, { data: result, ts: Date.now() });
      return new Response(result, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AI fallback with collected text
    if (rawText.length > 500) {
      console.log("Trying AI extraction...");
      const aiResult = await tryAIExtraction(rawText, ticker);
      if (aiResult) {
        cache.set(t, { data: aiResult, ts: Date.now() });
        return new Response(aiResult, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    return new Response(JSON.stringify({ error: "Não foi possível coletar lista de imóveis. Tente novamente." }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fii-properties error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
