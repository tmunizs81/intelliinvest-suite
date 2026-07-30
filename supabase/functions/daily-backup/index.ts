import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUser, requireCron, unauthorized } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Duas formas de invocação permitidas:
    //  1) cron/manutenção  -> header x-cron-secret (faz backup de todos)
    //  2) usuário logado   -> JWT válido (faz backup APENAS de si mesmo)
    // O `userId` do body é ignorado: nunca confie no cliente para escolher o alvo.
    const cronDenied = requireCron(req);
    const isCron = cronDenied === null;
    const authed = isCron ? null : await getUser(req);
    if (!isCron && !authed) return unauthorized("Backup exige sessão válida.");

    let userIds: string[] = [];
    if (isCron) {
      const { data: profiles } = await supabase.from("profiles").select("user_id");
      userIds = (profiles || []).map((p: any) => p.user_id);
    } else {
      userIds = [authed!.id];
    }

    const results: any[] = [];

    for (const userId of userIds) {
      try {
        // Fetch all user data
        const [holdingsRes, transactionsRes, alertsRes, telegramRes, familyRes, conversationsRes, messagesRes] = await Promise.all([
          supabase.from("holdings").select("*").eq("user_id", userId),
          supabase.from("transactions").select("*").eq("user_id", userId),
          supabase.from("alerts").select("*").eq("user_id", userId),
          supabase.from("telegram_settings").select("*").eq("user_id", userId),
          supabase.from("family_members").select("*").eq("owner_id", userId),
          supabase.from("ai_conversations").select("*").eq("user_id", userId),
          supabase.from("ai_messages").select("*").eq("user_id", userId),
        ]);

        const backup = {
          backupDate: new Date().toISOString(),
          userId,
          holdings: holdingsRes.data || [],
          transactions: transactionsRes.data || [],
          alerts: alertsRes.data || [],
          telegramSettings: telegramRes.data || [],
          familyMembers: familyRes.data || [],
          aiConversations: conversationsRes.data || [],
          aiMessages: messagesRes.data || [],
        };

        const jsonStr = JSON.stringify(backup, null, 2);
        const dateStr = new Date().toISOString().split("T")[0];
        const timeStr = new Date().toISOString().split("T")[1].replace(/[:.]/g, "-").slice(0, 8);
        const filePath = `${userId}/backup-${dateStr}-${timeStr}.json`;

        // Upload to storage
        const { error: uploadErr } = await supabase.storage
          .from("backups")
          .upload(filePath, jsonStr, {
            contentType: "application/json",
            upsert: true,
          });

        if (uploadErr) throw uploadErr;

        // Record in backups table
        await supabase.from("backups").insert({
          user_id: userId,
          file_path: filePath,
          size_bytes: new TextEncoder().encode(jsonStr).length,
          status: "completed",
          backup_type: "auto",
        });

        // Clean old backups - keep last 30
        const { data: oldBackups } = await supabase
          .from("backups")
          .select("id, file_path")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (oldBackups && oldBackups.length > 30) {
          const toDelete = oldBackups.slice(30);
          for (const b of toDelete) {
            await supabase.storage.from("backups").remove([b.file_path]);
            await supabase.from("backups").delete().eq("id", b.id);
          }
        }

        results.push({ userId, status: "ok" });
      } catch (err: any) {
        results.push({ userId, status: "error", error: err.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
