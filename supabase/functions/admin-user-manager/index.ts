// Admin-only user CRUD: update profile, reset password, edit license, delete user.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supaUser = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await supaUser.auth.getUser();
    if (!u.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SB_URL, SB_SRV);
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "forbidden — admin only" }, 403);

    const { action, target_user_id, payload } = await req.json();
    if (!action || !target_user_id) return json({ error: "action & target_user_id required" }, 400);

    switch (action) {
      case "update_profile": {
        const { display_name, email } = payload ?? {};
        if (display_name !== undefined)
          await admin.from("profiles").update({ display_name }).eq("user_id", target_user_id);
        if (email) {
          const { error } = await admin.auth.admin.updateUserById(target_user_id, { email });
          if (error) return json({ error: error.message }, 400);
        }
        return json({ ok: true });
      }
      case "reset_password": {
        const { new_password } = payload ?? {};
        if (!new_password || new_password.length < 8) return json({ error: "password >= 8 chars" }, 400);
        const { error } = await admin.auth.admin.updateUserById(target_user_id, { password: new_password });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "send_reset_email": {
        const { data: usr } = await admin.auth.admin.getUserById(target_user_id);
        if (!usr.user?.email) return json({ error: "no email" }, 400);
        const { error } = await admin.auth.resetPasswordForEmail(usr.user.email, {
          redirectTo: `${req.headers.get("origin") ?? ""}/reset-password`,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "set_license": {
        const { plan_type, expires_at, status } = payload ?? {};
        // upsert into serial_keys with a synthetic key per user
        const key = `admin-${target_user_id}`;
        const { error } = await admin.from("serial_keys").upsert({
          key, plan_type, status: status ?? "active",
          used_by: target_user_id, activated_at: new Date().toISOString(),
          expires_at: expires_at ?? null, created_by: u.user.id,
        }, { onConflict: "key" });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      case "toggle_admin": {
        const { make_admin } = payload ?? {};
        if (make_admin) {
          await admin.from("user_roles").upsert({ user_id: target_user_id, role: "admin" }, { onConflict: "user_id,role" });
        } else {
          await admin.from("user_roles").delete().eq("user_id", target_user_id).eq("role", "admin");
        }
        return json({ ok: true });
      }
      case "delete_user": {
        const { error } = await admin.auth.admin.deleteUser(target_user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
      default:
        return json({ error: `unknown action ${action}` }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
