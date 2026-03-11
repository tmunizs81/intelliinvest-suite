import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Check admin role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const adminId = claimsData.claims.sub;
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", adminId)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const { userId, newStatus } = await req.json();
    if (!userId || !newStatus) {
      return new Response(JSON.stringify({ error: "Missing userId or newStatus" }), { status: 400, headers: corsHeaders });
    }

    const statusMessages: Record<string, string> = {
      paused: "⏸️ *Licença Pausada*\n\nSua licença foi pausada pelo administrador. Algumas funcionalidades podem estar limitadas.\n\nEntre em contato com o suporte para mais informações.",
      frozen: "❄️ *Licença Congelada*\n\nSua licença foi congelada pelo administrador. O acesso ao sistema pode estar limitado.\n\nEntre em contato com o suporte.",
      revoked: "🚫 *Licença Revogada*\n\nSua licença foi revogada pelo administrador. Você não tem mais acesso ao sistema.\n\nEntre em contato com o suporte para regularizar sua situação.",
      used: "✅ *Licença Reativada*\n\nSua licença foi reativada com sucesso! Você já pode utilizar o sistema normalmente.",
    };

    const message = statusMessages[newStatus];
    if (!message) {
      return new Response(JSON.stringify({ error: "Invalid status" }), { status: 400, headers: corsHeaders });
    }

    // Get user's telegram settings
    const { data: tgSettings } = await adminClient
      .from("telegram_settings")
      .select("chat_id, enabled")
      .eq("user_id", userId)
      .single();

    if (!tgSettings?.chat_id || !tgSettings.enabled) {
      return new Response(
        JSON.stringify({ success: true, telegram: false, reason: "Telegram not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return new Response(
        JSON.stringify({ success: true, telegram: false, reason: "Bot token not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: tgSettings.chat_id,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const result = await resp.json();

    return new Response(
      JSON.stringify({ success: true, telegram: true, delivered: result.ok }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
