import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const started = performance.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Single RPC: refreshes today's snapshot for every user with holdings
    // and prunes anything older than 5 years. All work happens set-based
    // in Postgres — no per-user round-trips.
    const { data, error } = await supabase.rpc("refresh_all_daily_snapshots");
    if (error) throw error;

    const durationMs = Math.round(performance.now() - started);
    console.log(`Daily snapshot: ${data} users processed in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        users_processed: data,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Daily snapshot error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
