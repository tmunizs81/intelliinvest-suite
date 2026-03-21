/**
 * AI Response Cache — server-side cache using ai_cache table.
 * Hash the prompt, check cache, call AI only on miss.
 * 
 * Usage in Edge Functions:
 *   import { withAICache } from "./ai-cache-helper.ts";
 *   const result = await withAICache({ functionName, prompt, ttlMinutes, callAI: () => ... });
 */

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

interface CacheOptions {
  functionName: string;
  prompt: string;
  ttlMinutes?: number;
  callAI: () => Promise<{ text: string; provider: string; tokensUsed?: number }>;
}

interface CacheResult {
  text: string;
  provider: string;
  cached: boolean;
  cacheAge?: number; // seconds since cached
}

export async function withAICache(options: CacheOptions): Promise<CacheResult> {
  const { functionName, prompt, ttlMinutes = 60, callAI } = options;
  const hash = await sha256(prompt);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    "apikey": SERVICE_ROLE_KEY,
  };

  // 1. Check cache
  try {
    const cacheResp = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_cache?prompt_hash=eq.${hash}&function_name=eq.${functionName}&expires_at=gt.${new Date().toISOString()}&select=id,response_text,created_at,hit_count`,
      { headers: { ...headers, "Prefer": "return=representation" } }
    );

    if (cacheResp.ok) {
      const rows = await cacheResp.json();
      if (rows && rows.length > 0) {
        const row = rows[0];
        const ageSeconds = Math.floor((Date.now() - new Date(row.created_at).getTime()) / 1000);
        console.log(`[AI-Cache] HIT for ${functionName} (hash: ${hash.slice(0, 12)}..., age: ${ageSeconds}s, hits: ${row.hit_count + 1})`);

        // Increment hit count (fire-and-forget)
        fetch(
          `${SUPABASE_URL}/rest/v1/ai_cache?id=eq.${row.id}`,
          {
            method: "PATCH",
            headers: { ...headers, "Prefer": "return=minimal" },
            body: JSON.stringify({ hit_count: row.hit_count + 1 }),
          }
        ).catch(() => {});

        return {
          text: row.response_text,
          provider: "cache",
          cached: true,
          cacheAge: ageSeconds,
        };
      }
    }
  } catch (e) {
    console.warn("[AI-Cache] Cache lookup failed, proceeding without cache:", e);
  }

  // 2. Cache MISS — call AI
  console.log(`[AI-Cache] MISS for ${functionName} (hash: ${hash.slice(0, 12)}...)`);
  const result = await callAI();

  // 3. Store in cache (fire-and-forget)
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/ai_cache`,
      {
        method: "POST",
        headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          prompt_hash: hash,
          function_name: functionName,
          model: "gemini-2.5-flash",
          response_text: result.text,
          tokens_used: result.tokensUsed || 0,
          expires_at: expiresAt,
          hit_count: 0,
        }),
      }
    );
  } catch (e) {
    console.warn("[AI-Cache] Failed to store cache:", e);
  }

  return { text: result.text, provider: result.provider, cached: false };
}

/**
 * Normalize portfolio data for cache key generation.
 * Rounds prices to reduce cache misses from tiny price changes.
 */
export function normalizePortfolioForCache(portfolio: any[]): string {
  return portfolio
    .map(a => `${a.ticker}:${a.quantity}:${Math.round(a.currentPrice)}:${Math.round(a.avgPrice)}`)
    .sort()
    .join("|");
}
