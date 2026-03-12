import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const start = Date.now();
  const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};

  // 1. Database check
  try {
    const dbStart = Date.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);
    const { count, error } = await client.from("profiles").select("*", { count: "exact", head: true });
    if (error) throw error;
    checks.database = { status: "ok", latency_ms: Date.now() - dbStart };
  } catch (err: any) {
    checks.database = { status: "error", error: err.message };
  }

  // 2. Storage check
  try {
    const stStart = Date.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);
    const { data, error } = await client.storage.listBuckets();
    if (error) throw error;
    checks.storage = { status: "ok", latency_ms: Date.now() - stStart };
  } catch (err: any) {
    checks.storage = { status: "error", error: err.message };
  }

  // 3. Auth check
  try {
    const authStart = Date.now();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const resp = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
    });
    if (!resp.ok) throw new Error(`Auth settings returned ${resp.status}`);
    checks.auth = { status: "ok", latency_ms: Date.now() - authStart };
  } catch (err: any) {
    checks.auth = { status: "error", error: err.message };
  }

  const allOk = Object.values(checks).every(c => c.status === "ok");
  const totalLatency = Date.now() - start;

  return new Response(JSON.stringify({
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    total_latency_ms: totalLatency,
    checks,
  }), {
    status: allOk ? 200 : 503,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
