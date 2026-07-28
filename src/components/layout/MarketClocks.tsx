import { useEffect, useMemo, useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Market = {
  code: string;
  label: string;
  tz: string;
  openH: number;
  openM: number;
  closeH: number;
  closeM: number;
};

const MARKETS: Market[] = [
  { code: 'B3',     label: 'B3',     tz: 'America/Sao_Paulo', openH: 10, openM: 0,  closeH: 17, closeM: 55 },
  { code: 'NYSE',   label: 'NYSE',   tz: 'America/New_York',  openH: 9,  openM: 30, closeH: 16, closeM: 0 },
  { code: 'NASDAQ', label: 'NASDAQ', tz: 'America/New_York',  openH: 9,  openM: 30, closeH: 16, closeM: 0 },
  { code: 'LSE',    label: 'Londres',tz: 'Europe/London',     openH: 8,  openM: 0,  closeH: 16, closeM: 30 },
  { code: 'TSE',    label: 'Tóquio', tz: 'Asia/Tokyo',        openH: 9,  openM: 0,  closeH: 15, closeM: 0 },
];

function partsInTz(date: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((a, p) => {
    a[p.type] = p.value; return a;
  }, {});
  const dowMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return {
    y: +parts.year, m: +parts.month, d: +parts.day,
    h: +parts.hour % 24, mi: +parts.minute, s: +parts.second,
    dow: dowMap[parts.weekday] ?? 0,
  };
}

function computeStatus(now: Date, mk: Market) {
  const p = partsInTz(now, mk.tz);
  const nowSec = p.h * 3600 + p.mi * 60 + p.s;
  const openSec = mk.openH * 3600 + mk.openM * 60;
  const closeSec = mk.closeH * 3600 + mk.closeM * 60;
  const isWeekday = p.dow >= 1 && p.dow <= 5;
  const isOpen = isWeekday && nowSec >= openSec && nowSec < closeSec;

  if (isOpen) return { isOpen: true, seconds: closeSec - nowSec };

  let addDays = 0;
  if (isWeekday && nowSec < openSec) {
    addDays = 0;
  } else {
    addDays = 1;
    let d = (p.dow + 1) % 7;
    while (d === 0 || d === 6) { addDays++; d = (d + 1) % 7; }
  }
  const secsUntilMidnight = 24 * 3600 - nowSec;
  const seconds = addDays === 0
    ? openSec - nowSec
    : secsUntilMidnight + (addDays - 1) * 24 * 3600 + openSec;
  return { isOpen: false, seconds };
}

function fmt(sec: number) {
  if (sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function hhmm(h: number, m: number) {
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// Convert a wall time (HH:MM) in market tz to a time string in the target tz for today
function timeInTz(now: Date, mk: Market, h: number, m: number, targetTz: string) {
  // Build ISO for today in market tz then reformat to target tz
  const mp = partsInTz(now, mk.tz);
  // Compose date in market tz assuming today
  const iso = `${mp.y}-${String(mp.m).padStart(2,'0')}-${String(mp.d).padStart(2,'0')}T${hhmm(h,m)}:00`;
  // Interpret ISO as market-local by leveraging Date + offset via Intl
  // Simpler: return HH:MM in target tz by computing the offset difference between market and target now
  const nowInMarket = partsInTz(now, mk.tz);
  const nowInTarget = partsInTz(now, targetTz);
  const diffMin =
    (nowInTarget.h * 60 + nowInTarget.mi) - (nowInMarket.h * 60 + nowInMarket.mi);
  let total = h * 60 + m + diffMin;
  total = ((total % (24*60)) + 24*60) % (24*60);
  return hhmm(Math.floor(total / 60), total % 60);
}

export default function MarketClocks() {
  const [now, setNow] = useState(() => new Date());
  const userTz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const updatedAt = now.toLocaleTimeString('pt-BR', { hour12: false });

  return (
    <div
      className="hidden md:flex items-center gap-2 lg:gap-3 px-3 py-1.5 rounded-full border border-border bg-card/70 backdrop-blur"
      title={`Status calculado em ${updatedAt} (${userTz})`}
    >
      {MARKETS.map((mk) => {
        const st = computeStatus(now, mk);
        const color = st.isOpen ? 'bg-emerald-500' : 'bg-red-500';
        const openLocal = hhmm(mk.openH, mk.openM);
        const closeLocal = hhmm(mk.closeH, mk.closeM);
        const openUser = timeInTz(now, mk, mk.openH, mk.openM, userTz);
        const closeUser = timeInTz(now, mk, mk.closeH, mk.closeM, userTz);
        const nextEvent = st.isOpen
          ? `Fecha em ${fmt(st.seconds)} (${closeUser} ${userTz})`
          : `Abre em ${fmt(st.seconds)} (${openUser} ${userTz})`;
        return (
          <Tooltip key={mk.code}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 text-[11px] leading-none cursor-help">
                <span className={`h-1.5 w-1.5 rounded-full ${color} ${st.isOpen ? 'animate-pulse' : ''}`} />
                <span className="font-semibold text-foreground">{mk.label}</span>
                <span
                  className={`font-mono tabular-nums ${st.isOpen ? 'text-emerald-500' : 'text-red-500'}`}
                >
                  {st.isOpen ? '−' : ''}{fmt(st.seconds)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div className="space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
                  {mk.label} · {st.isOpen ? 'ABERTO' : 'FECHADO'}
                </div>
                <div className="text-muted-foreground">
                  Horário local ({mk.tz.split('/').pop()}): <span className="font-mono">{openLocal}–{closeLocal}</span>
                </div>
                <div className="text-muted-foreground">
                  Seu fuso ({userTz.split('/').pop()}): <span className="font-mono">{openUser}–{closeUser}</span>
                </div>
                <div className="pt-1 border-t border-border">
                  {nextEvent}
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">
                  Atualizado às {updatedAt}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
