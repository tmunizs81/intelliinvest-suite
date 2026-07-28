// Shared Telegram sender + cooldown-aware logger
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const admin = () => createClient(SB_URL, SB_SRV);

export async function sendTelegramRaw(chatId: string, html: string) {
  if (!TG_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN missing");
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) throw new Error(`telegram ${res.status}: ${JSON.stringify(j)}`);
  return j;
}

export interface DispatchOpts {
  userId: string;
  ruleId?: string | null;
  kind: string;
  html: string;
  cooldownMinutes?: number;
  payload?: Record<string, unknown>;
}

/** Sends respecting cooldown. Returns status. */
export async function dispatchAlert(o: DispatchOpts): Promise<"sent" | "failed" | "suppressed_cooldown"> {
  const db = admin();
  const cd = o.cooldownMinutes ?? 60;

  // Cooldown check
  if (o.ruleId && cd > 0) {
    const since = new Date(Date.now() - cd * 60_000).toISOString();
    const { data: recent } = await db
      .from("notification_log")
      .select("id")
      .eq("user_id", o.userId)
      .eq("rule_id", o.ruleId)
      .eq("status", "sent")
      .gte("sent_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      await db.from("notification_log").insert({
        user_id: o.userId, rule_id: o.ruleId, kind: o.kind, channel: "telegram",
        status: "suppressed_cooldown", payload: o.payload ?? {},
      });
      return "suppressed_cooldown";
    }
  }

  // Fetch chat_id
  const { data: tg } = await db
    .from("telegram_settings")
    .select("chat_id, enabled")
    .eq("user_id", o.userId)
    .maybeSingle();

  if (!tg?.chat_id || !tg.enabled) {
    await db.from("notification_log").insert({
      user_id: o.userId, rule_id: o.ruleId ?? null, kind: o.kind, channel: "telegram",
      status: "failed", error: "chat_id ausente ou desativado", payload: o.payload ?? {},
    });
    return "failed";
  }

  try {
    await sendTelegramRaw(tg.chat_id, o.html);
    await db.from("notification_log").insert({
      user_id: o.userId, rule_id: o.ruleId ?? null, kind: o.kind, channel: "telegram",
      status: "sent", payload: o.payload ?? {},
    });
    return "sent";
  } catch (e) {
    await db.from("notification_log").insert({
      user_id: o.userId, rule_id: o.ruleId ?? null, kind: o.kind, channel: "telegram",
      status: "failed", error: String(e), payload: o.payload ?? {},
    });
    return "failed";
  }
}

export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(n);
export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
