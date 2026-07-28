// Cron: every 1 min. Detects market open/close transitions and dispatches Telegram alerts.
// Reads rules with kind='market_open' or 'market_close'; meta.market = 'B3'|'NYSE'|'NASDAQ'|'LSE'|'TSE' (or 'ALL').
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { admin, dispatchAlert } from "../_shared/telegram.ts";

type MK = { code: string; label: string; tz: string; openH: number; openM: number; closeH: number; closeM: number };

const MARKETS: MK[] = [
  { code: 'B3',     label: 'B3 (Bovespa)', tz: 'America/Sao_Paulo', openH: 10, openM: 0,  closeH: 17, closeM: 55 },
  { code: 'NYSE',   label: 'NYSE',         tz: 'America/New_York',  openH: 9,  openM: 30, closeH: 16, closeM: 0 },
  { code: 'NASDAQ', label: 'NASDAQ',       tz: 'America/New_York',  openH: 9,  openM: 30, closeH: 16, closeM: 0 },
  { code: 'LSE',    label: 'Londres (LSE)',tz: 'Europe/London',     openH: 8,  openM: 0,  closeH: 16, closeM: 30 },
  { code: 'TSE',    label: 'Tóquio (TSE)', tz: 'Asia/Tokyo',        openH: 9,  openM: 0,  closeH: 15, closeM: 0 },
];

function partsInTz(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
  });
  const p = fmt.formatToParts(date).reduce<Record<string,string>>((a,x)=>{a[x.type]=x.value;return a;},{});
  const dow: Record<string,number> = { Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6 };
  return { h:+p.hour%24, m:+p.minute, dow: dow[p.weekday] ?? 0 };
}

// Returns 'open'|'close'|null if a transition happened within last `windowMin` minutes for market
function detectTransition(now: Date, mk: MK, windowMin: number): 'open' | 'close' | null {
  const p = partsInTz(now, mk.tz);
  if (p.dow < 1 || p.dow > 5) return null;
  const nowMin = p.h * 60 + p.m;
  const openMin = mk.openH * 60 + mk.openM;
  const closeMin = mk.closeH * 60 + mk.closeM;
  if (nowMin >= openMin && nowMin < openMin + windowMin) return 'open';
  if (nowMin >= closeMin && nowMin < closeMin + windowMin) return 'close';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = admin();
    const now = new Date();

    // Precompute transitions per market (window = 2 min to tolerate cron jitter)
    const transitions: Record<string, 'open'|'close'|null> = {};
    for (const mk of MARKETS) transitions[mk.code] = detectTransition(now, mk, 2);

    const { data: rules } = await db
      .from("alert_rules")
      .select("*")
      .eq("enabled", true)
      .in("kind", ["market_open", "market_close"]);

    let fired = 0;
    for (const r of (rules ?? []) as any[]) {
      const wanted = r.kind === "market_open" ? "open" : "close";
      const marketFilter = (r.meta?.market ?? "ALL") as string;

      for (const mk of MARKETS) {
        if (marketFilter !== "ALL" && marketFilter !== mk.code) continue;
        if (transitions[mk.code] !== wanted) continue;

        const emoji = wanted === "open" ? "🟢" : "🔴";
        const verb = wanted === "open" ? "ABERTA" : "FECHADA";
        const html = `${emoji} <b>${mk.label} ${verb}</b>
Horário: ${String(mk.openH).padStart(2,'0')}:${String(mk.openM).padStart(2,'0')}–${String(mk.closeH).padStart(2,'0')}:${String(mk.closeM).padStart(2,'0')} (${mk.tz})

🔗 <a href="https://simplynvest.t2systems.com.br/">Abrir dashboard</a>`;

        await dispatchAlert({
          userId: r.user_id,
          ruleId: r.id,
          kind: `${r.kind}:${mk.code}`,
          html,
          cooldownMinutes: r.cooldown_minutes ?? 60,
          payload: { market: mk.code, event: wanted },
        });
        fired++;
      }
    }

    return new Response(JSON.stringify({ ok: true, fired, transitions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
