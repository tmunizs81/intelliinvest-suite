
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { alertType, userId, details } = await req.json();

    if (!alertType || !userId) {
      return new Response(JSON.stringify({ error: "alertType and userId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get telegram settings
    const { data: tgSetting } = await adminClient
      .from("telegram_settings")
      .select("chat_id")
      .eq("user_id", userId)
      .eq("enabled", true)
      .maybeSingle();

    if (!tgSetting?.chat_id) {
      return new Response(JSON.stringify({ sent: false, reason: "No telegram" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alertMessages: Record<string, string> = {
      new_login: `🔐 *Alerta de Segurança*\n\n🖥️ *Novo login detectado*\n\n📅 ${new Date().toLocaleString('pt-BR')}\n${details?.device ? `📱 Dispositivo: ${details.device}` : ''}\n${details?.ip ? `🌐 IP: ${details.ip}` : ''}\n\n⚠️ Se não foi você, altere sua senha imediatamente com /senha`,

      license_expiring: `⚠️ *Alerta de Licença*\n\n📅 Sua licença expira em *${details?.daysLeft || '?'} dias*\n\nRenove pelo T2-Simplynvest para não perder acesso.`,

      license_expired: `🚫 *Licença Expirada*\n\nSua licença expirou. Renove para continuar usando o T2-Simplynvest.\n\nEntre em contato com o suporte.`,

      suspicious_activity: `🚨 *Atividade Suspeita Detectada*\n\n${details?.description || 'Atividade incomum na sua conta.'}\n\n📅 ${new Date().toLocaleString('pt-BR')}\n\n⚠️ Se não reconhece, altere sua senha com /senha`,

      password_changed: `✅ *Senha Alterada*\n\nSua senha foi alterada com sucesso em ${new Date().toLocaleString('pt-BR')}.\n\n⚠️ Se não foi você, entre em contato imediatamente com o suporte.`,

      large_transaction: `💸 *Transação Grande Detectada*\n\n${details?.operation || 'Operação'}: *${details?.ticker || ''}*\n💰 Valor: R$${(details?.total || 0).toFixed(2)}\n📅 ${new Date().toLocaleString('pt-BR')}\n\nSe não reconhece, verifique sua conta.`,
    };

    const message = alertMessages[alertType] || `🔔 *Alerta de Segurança*\n\n${alertType}\n${JSON.stringify(details || {})}`;

    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: tgSetting.chat_id,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const result = await resp.json();

    // Log to audit
    await adminClient.from("audit_logs").insert({
      user_id: userId,
      action: "telegram_security_alert",
      entity_type: "security",
      details: { alertType, sent: result.ok },
    });

    return new Response(JSON.stringify({ sent: result.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-security-alert error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
