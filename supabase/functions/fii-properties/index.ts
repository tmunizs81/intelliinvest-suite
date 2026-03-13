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
  const markers = [
    "lista de imóveis",
    "lista de imoveis",
    "portfólio",
    "portfolio",
    "imóveis",
    "imoveis",
    "propriedades",
  ];

  const lower = html.toLowerCase();
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx !== -1) {
      const start = Math.max(0, idx - 2000);
      const end = Math.min(html.length, idx + 22000);
      return html.slice(start, end);
    }
  }

  // fallback to limited HTML chunk to reduce noisy parsing
  return html.slice(0, 25000);
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
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
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

    // Sequential fetch to avoid aggressive concurrent timeouts
    for (const url of sources) {
      const html = await fetchHtml(url, 10000);
      if (!html) continue;

      const parsed = filterQuality(parseByPatterns(html));
      if (parsed.length > 0) {
        collected.push(...parsed);
      }

      textForAI += `\n\n[${url}]\n${stripHtmlText(html).slice(0, 3500)}`;

      // Fast path: if we already have enough items, stop early
      const mergedFast = dedupeProperties(collected);
      if (mergedFast.length >= 5) {
        const resultFast = JSON.stringify({
          fund_name: ticker.toUpperCase(),
          total_properties: mergedFast.length,
          properties: mergedFast,
        });
        cache.set(t, { data: resultFast, ts: Date.now() });
        return new Response(resultFast, {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const merged = dedupeProperties(collected);
    if (merged.length > 0) {
      const result = JSON.stringify({
        fund_name: ticker.toUpperCase(),
        total_properties: merged.length,
        properties: merged,
      });
      cache.set(t, { data: result, ts: Date.now() });
      return new Response(result, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // AI fallback strategy requested: DeepSeek first, then Lovable
    const deepseekProps = await callDeepSeek(textForAI, ticker);
    if (deepseekProps && deepseekProps.length > 0) {
      const result = JSON.stringify({
        fund_name: ticker.toUpperCase(),
        total_properties: deepseekProps.length,
        properties: deepseekProps,
      });
      cache.set(t, { data: result, ts: Date.now() });
      return new Response(result, {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableProps = await callLovableFallback(textForAI, ticker);
    if (lovableProps && lovableProps.length > 0) {
      const result = JSON.stringify({
        fund_name: ticker.toUpperCase(),
        total_properties: lovableProps.length,
        properties: lovableProps,
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
