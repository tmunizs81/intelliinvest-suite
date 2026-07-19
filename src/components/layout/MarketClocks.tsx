import { useEffect, useState } from 'react';

type Market = {
  code: string;
  label: string;
  tz: string;
  openH: number;
  openM: number;
  closeH: number;
  closeM: number;
  // 0=Sun ... 6=Sat
  days?: number[];
};

const MARKETS: Market[] = [
  { code: 'B3',     label: 'B3',     tz: 'America/Sao_Paulo', openH: 10, openM: 0,  closeH: 17, closeM: 55 },
  { code: 'NYSE',   label: 'NYSE',   tz: 'America/New_York',  openH: 9,  openM: 30, closeH: 16, closeM: 0 },
  { code: 'NASDAQ', label: 'NASDAQ', tz: 'America/New_York',  openH: 9,  openM: 30, closeH: 16, closeM: 0 },
  { code: 'LSE',    label: 'Londres',tz: 'Europe/London',     openH: 8,  openM: 0,  closeH: 16, closeM: 30 },
  { code: 'TSE',    label: 'Tóquio', tz: 'Asia/Tokyo',        openH: 9,  openM: 0,  closeH: 15, closeM: 0 },
];

// Get { y,m,d,h,mi,s, dow } for a Date in a given IANA tz
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

// Compute ms until next open (or until close if currently open)
function computeStatus(now: Date, mk: Market) {
  const p = partsInTz(now, mk.tz);
  const nowSec = p.h * 3600 + p.mi * 60 + p.s;
  const openSec = mk.openH * 3600 + mk.openM * 60;
  const closeSec = mk.closeH * 3600 + mk.closeM * 60;
  const isWeekday = p.dow >= 1 && p.dow <= 5;
  const isOpen = isWeekday && nowSec >= openSec && nowSec < closeSec;

  if (isOpen) {
    return { isOpen: true, seconds: closeSec - nowSec };
  }

  // Compute days until next weekday open
  let addDays = 0;
  let targetDow = p.dow;
  // If today is a weekday and not yet open, open today
  if (isWeekday && nowSec < openSec) {
    addDays = 0;
  } else {
    // find next weekday
    addDays = 1;
    let d = (p.dow + 1) % 7;
    while (d === 0 || d === 6) { addDays++; d = (d + 1) % 7; }
    targetDow = d;
  }
  void targetDow;
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

export default function MarketClocks() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hidden md:flex items-center gap-2 lg:gap-3 px-3 py-1.5 rounded-full border border-border bg-card/70 backdrop-blur">
      {MARKETS.map((mk) => {
        const st = computeStatus(now, mk);
        const color = st.isOpen
          ? 'bg-emerald-500'
          : st.seconds < 3600
          ? 'bg-amber-500'
          : 'bg-muted-foreground/50';
        return (
          <div key={mk.code} className="flex items-center gap-1.5 text-[11px] leading-none">
            <span className={`h-1.5 w-1.5 rounded-full ${color} ${st.isOpen ? 'animate-pulse' : ''}`} />
            <span className="font-semibold text-foreground">{mk.label}</span>
            <span
              className={`font-mono tabular-nums ${st.isOpen ? 'text-emerald-500' : 'text-muted-foreground'}`}
              title={st.isOpen ? 'Fecha em' : 'Abre em'}
            >
              {st.isOpen ? '−' : ''}{fmt(st.seconds)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
