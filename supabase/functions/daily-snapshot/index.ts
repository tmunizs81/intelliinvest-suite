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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all users who have holdings
    const { data: userIds, error: usersError } = await supabase
      .from("holdings")
      .select("user_id")
      .limit(1000);

    if (usersError) throw usersError;

    // Deduplicate user IDs
    const uniqueUsers = [...new Set((userIds || []).map((r: any) => r.user_id))];
    const today = new Date().toISOString().split("T")[0];
    let processed = 0;
    let skipped = 0;

    for (const userId of uniqueUsers) {
      // Check if snapshot already exists for today
      const { data: existing } = await supabase
        .from("portfolio_snapshots")
        .select("id")
        .eq("user_id", userId)
        .eq("snapshot_date", today)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Get user's holdings
      const { data: holdings } = await supabase
        .from("holdings")
        .select("ticker, quantity, avg_price, type")
        .eq("user_id", userId);

      if (!holdings || holdings.length === 0) continue;

      // For non-market assets, use avg_price as current price (conservative)
      // This ensures snapshots exist even without live quotes
      const totalCost = holdings.reduce(
        (s: number, h: any) => s + h.avg_price * h.quantity,
        0
      );

      // Try to get last known snapshot value, or use cost as fallback
      const { data: lastSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("total_value")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const totalValue = lastSnapshot?.total_value || totalCost;

      await supabase.from("portfolio_snapshots").insert({
        user_id: userId,
        snapshot_date: today,
        total_value: totalValue,
        total_cost: totalCost,
        assets_count: holdings.length,
      });

      processed++;
    }

    console.log(
      `Daily snapshot: ${processed} created, ${skipped} skipped, ${uniqueUsers.length} users total`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        skipped,
        total: uniqueUsers.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Daily snapshot error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
