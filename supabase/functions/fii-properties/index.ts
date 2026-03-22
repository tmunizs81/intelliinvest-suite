const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

const BRAZIL_STATES = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
]);

const NAME_BLACKLIST = [
  "cota", "cotas", "volume", "carteira", "ações", "acao", "bdr", "stocks", "stock",
  "tipo", "busca", "close", "revisão", "revisao", "contrato", "contratos", "dy", "p/vp",
  "vacância", "vacancia", "yield", "patrimônio", "patrimonio", "cotista", "cotistas", "cadastre",
  "{title}", "null", "undefined",
];

const cache = new Map<string, { data: string; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

interface Property {
  name: string;
  state: string;
  city?: string;
  type?: string;
}

function pickUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function decodeHtmlEntities(input: string): string {
  if (!input) return "";

  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isValidState(value: string): boolean {
  return BRAZIL_STATES.has(value.toUpperCase());
}

function isLikelyPropertyName(name: string): boolean {
  if (!name) return false;
  const n = cleanText(name);

  if (n.length < 4 || n.length > 90) return false;
  if (/[{}<>]/.test(n)) return false;
  if (/^(r\$|\d+([.,]\d+)?)$/i.test(n)) return false;

  const lower = n.toLowerCase();
  if (NAME_BLACKLIST.some((w) => lower.includes(w))) return false;

  // Reject if looks like pure metrics/ui labels
  if (/^(lista|fonte|indicadores|valuation|operacional|preço|preco)$/i.test(n)) return false;

  // Require at least one letter and one separator (space, -, /) to avoid short UI labels
  if (!/[a-zà-ú]/i.test(n)) return false;
  if (!/[\s\-/]/.test(n) && n.length < 8) return false;

  return true;
}

function normalizeProperty(name: string, state: string): Property | null {
  const cleanedName = cleanText(name);
  const uf = state.toUpperCase().trim();

  if (!isValidState(uf)) return null;
  if (!isLikelyPropertyName(cleanedName)) return null;

  return { name: cleanedName, state: uf };
}

function dedupeProperties(properties: Property[]): Property[] {
  const seen = new Set<string>();
  const result: Property[] = [];

  for (const p of properties) {
    const key = `${p.name.toLowerCase()}::${p.state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }

  return result;
}

function extractFocusedSection(html: string): string {
  // Strip scripts/styles first to reduce noise
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  return cleaned;
}

// Dedicated parser for Investidor10's property cards structure:
// Pattern in HTML: heading with property name, then "Estado:" with state name
function parseInvestidor10Properties(html: string): Property[] {
  const properties: Property[] = [];
  const seen = new Set<string>();

  // State name to code mapping
  const stateMap: Record<string, string> = {
    "são paulo": "SP", "rio de janeiro": "RJ", "minas gerais": "MG",
    "paraná": "PR", "rio grande do sul": "RS", "santa catarina": "SC",
    "bahia": "BA", "pernambuco": "PE", "ceará": "CE", "goiás": "GO",
    "distrito federal": "DF", "espírito santo": "ES", "mato grosso": "MT",
    "mato grosso do sul": "MS", "pará": "PA", "paraíba": "PB",
    "piauí": "PI", "rio grande do norte": "RN", "rondônia": "RO",
    "roraima": "RR", "sergipe": "SE", "tocantins": "TO",
    "alagoas": "AL", "amapá": "AP", "amazonas": "AM", "acre": "AC",
    "maranhão": "MA",
  };

  // Pattern: <h3/h4/strong>NAME</h3> ... Estado: STATE ... Área bruta locável: X m²
  const regex = /<(?:h[2-5]|strong)[^>]*>\s*([^<]{2,80})\s*<\/(?:h[2-5]|strong)>[\s\S]{0,300}?Estado:\s*([A-Za-zÀ-Úà-ú\s]+?)(?:\s*<|$)/gi;
  let m;
  while ((m = regex.exec(html)) !== null && properties.length < 80) {
    const name = cleanText(m[1]);
    const stateRaw = m[2].trim().toLowerCase();
    const stateCode = stateMap[stateRaw] || (stateRaw.length === 2 ? stateRaw.toUpperCase() : null);

    if (!stateCode || !isValidState(stateCode)) continue;
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    // Extract area if present
    const areaChunk = html.substring(m.index!, m.index! + 500);
    const areaMatch = areaChunk.match(/[Áá]rea\s*(?:bruta\s*)?(?:loc[áa]vel)?:\s*([\d.,]+)\s*m/i);

    seen.add(key);
    properties.push({ name, state: stateCode });
  }

  return properties;
}

async function fetchHtml(url: string, timeoutMs = 10000): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": pickUA(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    console.warn(`fetchHtml failed (${url}):`, e instanceof Error ? e.message : e);
    return null;
  }
}

function parseByPatterns(html: string): Property[] {
  const scope = extractFocusedSection(html);
  const props: Property[] = [];

  const patterns: RegExp[] = [
    // name ... UF
    /(?:>|"|\b)([A-ZÀ-Ú][A-Za-zÀ-Úà-ú0-9\s\-.\/]{3,90}?)(?:<|"|\s|,|\-|\|){1,4}(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/g,
    // JSON-like: "name":"...","state":"SP"
    /"(?:name|nome|title)"\s*:\s*"([^"\\]{3,90})"[\s\S]{0,120}?"(?:state|uf|estado)"\s*:\s*"([A-Z]{2})"/gi,
    // Alternate JSON-like: "state":"SP" ... "name":"..."
    /"(?:state|uf|estado)"\s*:\s*"([A-Z]{2})"[\s\S]{0,120}?"(?:name|nome|title)"\s*:\s*"([^"\\]{3,90})"/gi,
  ];

  for (const regex of patterns) {
    let m: RegExpExecArray | null;
    while ((m = regex.exec(scope)) !== null && props.length < 120) {
      let maybeName = "";
      let maybeState = "";

      if (m[2] && m[2].length === 2 && isValidState(m[2])) {
        maybeName = m[1];
        maybeState = m[2];
      } else if (m[1] && m[1].length === 2 && isValidState(m[1])) {
        maybeName = m[2];
        maybeState = m[1];
      }

      const normalized = normalizeProperty(maybeName, maybeState);
      if (normalized) props.push(normalized);
    }
  }

  return dedupeProperties(props);
}

function filterQuality(properties: Property[]): Property[] {
  if (properties.length === 0) return properties;

  const valid = properties.filter((p) => isLikelyPropertyName(p.name));
  const qualityRatio = valid.length / properties.length;

  // If parsing is too noisy, reject all and rely on AI fallback
  if (qualityRatio < 0.55) return [];

  return dedupeProperties(valid);
}

function stripHtmlText(html: string): string {
  return decodeHtmlEntities(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function callDeepSeek(text: string, ticker: string): Promise<Property[] | null> {
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
  if (!DEEPSEEK_API_KEY) return null;

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Extraia somente imóveis/propriedades de FIIs no Brasil e devolva JSON puro no formato: {\"properties\":[{\"name\":\"...\",\"state\":\"SP\"}]}.",
          },
          {
            role: "user",
            content: `FII: ${ticker.toUpperCase()}\nTexto:\n${text.slice(0, 9000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = String(content).match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const list = Array.isArray(parsed?.properties) ? parsed.properties : [];

    const normalized = list
      .map((p: any) => normalizeProperty(String(p?.name ?? ""), String(p?.state ?? "")))
      .filter(Boolean) as Property[];

    return filterQuality(dedupeProperties(normalized));
  } catch (e) {
    console.warn("DeepSeek extraction failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function callLovableFallback(text: string, ticker: string): Promise<Property[] | null> {
  if (!LOVABLE_API_KEY) return null;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Extraia somente imóveis/propriedades de FIIs no Brasil e devolva JSON puro no formato: {\"properties\":[{\"name\":\"...\",\"state\":\"SP\"}]}.",
          },
          {
            role: "user",
            content: `FII: ${ticker.toUpperCase()}\nTexto:\n${text.slice(0, 9000)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonMatch = String(content).match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const list = Array.isArray(parsed?.properties) ? parsed.properties : [];

    const normalized = list
      .map((p: any) => normalizeProperty(String(p?.name ?? ""), String(p?.state ?? "")))
      .filter(Boolean) as Property[];

    return filterQuality(dedupeProperties(normalized));
  } catch (e) {
    console.warn("Lovable fallback extraction failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker } = await req.json();
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const t = String(ticker).toLowerCase();

    const cached = cache.get(t);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(cached.data, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sources = [
      `https://investidor10.com.br/fiis/${t}/`,
      `https://statusinvest.com.br/fundos-imobiliarios/${t}`,
      `https://www.fundsexplorer.com.br/funds/${t}`,
    ];

    const collected: Property[] = [];
    let textForAI = "";

    // Fetch sources sequentially
    for (const url of sources) {
      const html = await fetchHtml(url, 10000);
      if (!html) continue;

      // Try dedicated Investidor10 parser first (most reliable)
      if (url.includes("investidor10")) {
        const inv10Props = parseInvestidor10Properties(html);
        console.log(`Investidor10 structured parser: ${inv10Props.length} properties`);
        if (inv10Props.length >= 3) {
          // Great result from structured parser - cache and return
          const result = JSON.stringify({
            fund_name: ticker.toUpperCase(),
            total_properties: inv10Props.length,
            properties: inv10Props,
          });
          cache.set(t, { data: result, ts: Date.now() });
          return new Response(result, {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        collected.push(...inv10Props);
      }

      // Generic regex parsing
      const parsed = filterQuality(parseByPatterns(html));
      if (parsed.length > 0) {
        collected.push(...parsed);
      }

      // Keep more text for AI (property lists are deep in the page)
      textForAI += `\n\n[${url}]\n${stripHtmlText(html).slice(0, 8000)}`;
    }

    const regexMerged = dedupeProperties(collected);
    console.log(`Total parsing found ${regexMerged.length} properties for ${ticker}`);

    // ALWAYS try AI if we have text, since regex is unreliable for property extraction
    if (textForAI.length > 500) {
      console.log(`Trying DeepSeek AI extraction for ${ticker}...`);
      const deepseekProps = await callDeepSeek(textForAI, ticker);
      if (deepseekProps && deepseekProps.length > 0) {
        console.log(`DeepSeek found ${deepseekProps.length} properties`);
        const combined = dedupeProperties([...deepseekProps, ...regexMerged]);
        const result = JSON.stringify({
          fund_name: ticker.toUpperCase(),
          total_properties: combined.length,
          properties: combined,
        });
        cache.set(t, { data: result, ts: Date.now() });
        return new Response(result, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`DeepSeek failed, trying Lovable fallback for ${ticker}...`);

      const lovableProps = await callLovableFallback(textForAI, ticker);
      if (lovableProps && lovableProps.length > 0) {
        console.log(`Lovable found ${lovableProps.length} properties`);
        const combined = dedupeProperties([...lovableProps, ...regexMerged]);
        const result = JSON.stringify({
          fund_name: ticker.toUpperCase(),
          total_properties: combined.length,
          properties: combined,
        });
        cache.set(t, { data: result, ts: Date.now() });
        return new Response(result, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fallback: return regex results if AI failed
    if (regexMerged.length > 0) {
      const result = JSON.stringify({
        fund_name: ticker.toUpperCase(),
        total_properties: regexMerged.length,
        properties: regexMerged,
      });
      cache.set(t, { data: result, ts: Date.now() });
      return new Response(result, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Não foi possível coletar a lista de imóveis no momento." }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("fii-properties error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
