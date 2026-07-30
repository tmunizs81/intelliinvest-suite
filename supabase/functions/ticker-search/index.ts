import { resolveCaller } from "../_shared/auth.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";
import { withHttpCache, cacheKey, cacheHeaders, CACHE_TTL } from "../_shared/http-cache.ts";
import { logMetric } from "../_telemetry.ts";

const NS = "ticker-search";
let COLD_START = true;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  exchangeDisplay: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Proxy de dados de mercado: exige sessão válida (ou chamada interna) para não
  // servir de gateway anônimo em cima da nossa cota de Yahoo/Brapi/BCB.
  const caller = await resolveCaller(req);
  if (caller instanceof Response) return caller;

  if (!caller.isInternal) {
    const limited = await enforceRateLimit(req, caller.subjectId, {
      resource: "ticker-search", max: 60, windowSeconds: 60,
    });
    if (limited) return limited;
  }

  const started = performance.now();

  try {
    const { query, refresh = false } = await req.json();

    if (!query || typeof query !== "string" || query.length < 1) {
      return new Response(
        JSON.stringify({ results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ttl = CACHE_TTL.tickerSearch;
    const { value: results, hit } = await withHttpCache<SearchResult[]>(
      { namespace: NS, key: cacheKey(query), ttl, bypass: refresh === true },
      async () => {
        const out: SearchResult[] = [];
        // Source 1: Yahoo Finance autocomplete API
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;
        const resp = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!resp.ok) throw new Error(`Yahoo search HTTP ${resp.status}`);

        const data = await resp.json();
        const quotes = data.quotes || [];

        for (const q of quotes) {
          if (!q.symbol) continue;

          // Map exchange to readable name
          const exchangeMap: Record<string, string> = {
            SAO: "B3",
            BSP: "B3",
            ISE: "Euronext Dublin",
            LSE: "London",
            AMS: "Euronext Amsterdam",
            MIL: "Borsa Italiana",
            FRA: "Frankfurt",
            ETR: "XETRA",
            PAR: "Euronext Paris",
            NMS: "NASDAQ",
            NYQ: "NYSE",
            NGM: "NASDAQ",
            ASE: "NYSE",
            BTS: "Budapest",
            SWX: "SIX Swiss",
          };
          const exchangeDisplay = exchangeMap[q.exchange] || q.exchange || "";

          // Map type
          let type = "Ação";
          const qType = (q.quoteType || q.typeDisp || "").toUpperCase();
          if (qType.includes("ETF")) type = "ETF";
          else if (qType.includes("FUND") || qType.includes("MUTUALFUND")) type = "Fundo";
          else if (qType.includes("CRYPTO") || qType.includes("CURRENCY")) type = "Cripto";
          else if (qType.includes("INDEX")) type = "Índice";

          // For B3 tickers, strip .SA suffix
          let symbol = q.symbol;
          if (symbol.endsWith(".SA")) symbol = symbol.replace(".SA", "");

          out.push({
            symbol,
            name: q.shortname || q.longname || q.symbol,
            type,
            exchange: q.exchange || "",
            exchangeDisplay,
          });
        }
        return out;
      },
    ).catch((e) => {
      console.warn("Yahoo search failed:", (e as Error).message);
      return { value: [] as SearchResult[], hit: false };
    });

    logMetric({
      function_name: "ticker-search",
      duration_ms: performance.now() - started,
      status_code: 200,
      user_id: caller.user?.id ?? null,
      cache_hit: hit,
      meta: { cold_start: COLD_START },
    });
    COLD_START = false;

    return new Response(
      JSON.stringify({ results, _cached: hit }),
      { headers: { ...corsHeaders, ...cacheHeaders(hit, ttl), "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ticker-search error:", err);
    logMetric({
      function_name: "ticker-search",
      duration_ms: performance.now() - started,
      status_code: 500,
      user_id: caller.user?.id ?? null,
      error_message: err instanceof Error ? err.message : "Unknown error",
    });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error", results: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

});
