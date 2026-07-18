const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOKEN_LIST_URL =
  "https://raw.githubusercontent.com/ondoprotocol/ondo-global-markets-token-list/main/tokenlist.json";

interface OndoToken {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  tags?: string[];
}

interface TokenList {
  name: string;
  timestamp: string;
  tokens: OndoToken[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Fetching Ondo GM token list from GitHub...");

    const resp = await fetch(TOKEN_LIST_URL, {
      headers: { "User-Agent": "SimplyNvest/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      throw new Error(`GitHub fetch failed: ${resp.status} ${resp.statusText}`);
    }

    const data: TokenList = await resp.json();
    console.log(`Fetched ${data.tokens.length} tokens (timestamp: ${data.timestamp})`);

    // Deduplicate by symbol (same token on multiple chains)
    const uniqueTokens = new Map<string, { name: string; underlying: string; chainId: number; address: string; logoURI: string }>();

    for (const token of data.tokens) {
      const symbol = token.symbol;
      if (!uniqueTokens.has(symbol)) {
        // Extract underlying ticker by removing "on" suffix
        const underlying = symbol.endsWith("on") ? symbol.slice(0, -2) : symbol;
        uniqueTokens.set(symbol, {
          name: token.name,
          underlying,
          chainId: token.chainId,
          address: token.address,
          logoURI: token.logoURI,
        });
      }
    }

    console.log(`Unique symbols: ${uniqueTokens.size}`);

    // Upsert into database using service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const now = new Date().toISOString();
    let upserted = 0;
    let errors = 0;

    // Batch upsert in chunks of 50
    const entries = [...uniqueTokens.entries()];
    for (let i = 0; i < entries.length; i += 50) {
      const chunk = entries.slice(i, i + 50);
      const rows = chunk.map(([symbol, info]) => ({
        symbol,
        name: info.name,
        underlying_ticker: info.underlying,
        chain_id: info.chainId,
        token_address: info.address,
        logo_uri: info.logoURI,
        synced_at: now,
      }));

      const upsertResp = await fetch(
        `${supabaseUrl}/rest/v1/ondo_gm_tokens`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(rows),
        }
      );

      if (upsertResp.ok) {
        upserted += chunk.length;
      } else {
        const errText = await upsertResp.text();
        console.error(`Upsert batch error: ${errText}`);
        errors += chunk.length;
      }
    }

    // Remove tokens no longer in the official list
    const allSymbols = [...uniqueTokens.keys()];
    const deleteResp = await fetch(
      `${supabaseUrl}/rest/v1/ondo_gm_tokens?symbol=not.in.(${allSymbols.map(s => `"${s}"`).join(",")})`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      }
    );
    const deletedCount = deleteResp.ok ? "ok" : "failed";

    const result = {
      success: true,
      totalFromGitHub: data.tokens.length,
      uniqueSymbols: uniqueTokens.size,
      upserted,
      errors,
      staleRemoval: deletedCount,
      timestamp: data.timestamp,
      syncedAt: now,
    };

    console.log("Sync complete:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-ondo-tokens error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
