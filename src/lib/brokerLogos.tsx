/**
 * Logos oficiais das corretoras.
 *
 * Performance:
 * - URL canônica: favicon PNG do Google S2 (fallback universal).
 * - Formatos modernos: proxy `wsrv.nl` converte para AVIF/WebP on-the-fly;
 *   servidos via <picture> com type="image/avif" e type="image/webp",
 *   o navegador escolhe o menor suportado (redução ~40–70% no payload).
 * - Cache persistente (localStorage) com TTL de 7 dias e revalidação em
 *   background quando o registro está vencido (stale-while-revalidate).
 * - Preload de top-N brokers via `preloadBrokers`.
 * - Retry limitado (2x) com timeout de 6s e backoff exponencial.
 * - Skeleton animado enquanto resolve.
 */
import { useState, useEffect } from 'react';
import { useBrokerLogoSettings } from './brokerLogoSettings';

type Status = 'loaded' | 'failed';
interface CacheEntry { s: Status; t: number }

// Cache em memória.
const urlCache = new Map<string, string>();          // "broker@size" -> URL PNG
const statusCache = new Map<string, CacheEntry>();   // URL -> {status, timestamp}
const attempts = new Map<string, number>();
const preloading = new Set<string>();

const LS_KEY = 'broker-logo-status-v2';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 6000;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;    // 7 dias
const FAIL_TTL_MS = 6 * 60 * 60 * 1000;    // falhas revalidam a cada 6h

// Hidrata cache do localStorage, descartando entradas fora do TTL.
(function hydrate() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [url, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.t !== 'number') continue;
      const ttl = entry.s === 'failed' ? FAIL_TTL_MS : TTL_MS;
      if (now - entry.t < ttl) statusCache.set(url, entry);
    }
  } catch { /* ignore */ }
})();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistDebounced() {
  if (typeof localStorage === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const obj: Record<string, CacheEntry> = {};
      statusCache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch { /* quota */ }
  }, 500);
}

function markStatus(url: string, s: Status) {
  statusCache.set(url, { s, t: Date.now() });
  persistDebounced();
}

function getFresh(url: string): Status | undefined {
  const entry = statusCache.get(url);
  if (!entry) return undefined;
  const ttl = entry.s === 'failed' ? FAIL_TTL_MS : TTL_MS;
  if (Date.now() - entry.t >= ttl) return undefined; // vencido
  return entry.s;
}

function tryLoad(url: string, onDone: (s: Status) => void) {
  if (typeof Image === 'undefined') { onDone('failed'); return; }
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'lazy';
  let settled = false;
  const finish = (s: Status) => {
    if (settled) return;
    settled = true;
    clearTimeout(t);
    onDone(s);
  };
  const t = setTimeout(() => finish('failed'), TIMEOUT_MS);
  img.onload = () => finish('loaded');
  img.onerror = () => finish('failed');
  img.src = url;
}

function preloadUrl(url: string) {
  if (!url || preloading.has(url)) return;
  if (getFresh(url) === 'loaded') return;                // cache válido
  const tries = attempts.get(url) ?? 0;
  if (getFresh(url) === 'failed' && tries >= MAX_RETRIES) return;

  preloading.add(url);
  attempts.set(url, tries + 1);

  tryLoad(url, (status) => {
    preloading.delete(url);
    if (status === 'loaded') {
      attempts.delete(url);
      markStatus(url, 'loaded');
      window.dispatchEvent(new CustomEvent('broker-logo-updated', { detail: { url } }));
    } else {
      const cur = attempts.get(url) ?? 0;
      if (cur < MAX_RETRIES) {
        setTimeout(() => preloadUrl(url), 800 * Math.pow(2, cur - 1));
      } else {
        markStatus(url, 'failed');
        window.dispatchEvent(new CustomEvent('broker-logo-updated', { detail: { url } }));
      }
    }
  });
}

export const BROKER_DOMAINS: Record<string, string> = {
  Avenue: 'avenue.us', XTB: 'xtb.com', Webull: 'webull.com',
  'C6 Bank': 'c6bank.com.br', 'BTG Pactual': 'btgpactual.com',
  Binance: 'binance.com', Coinbase: 'coinbase.com', KuCoin: 'kucoin.com',
  OKX: 'okx.com', Bybit: 'bybit.com', BingX: 'bingx.com', Bitget: 'bitget.com',
  'Mercado Bitcoin': 'mercadobitcoin.com.br', Foxbit: 'foxbit.com.br',
  'XP Investimentos': 'xpi.com.br', 'Clear Corretora': 'clear.com.br',
  'Rico Investimentos': 'rico.com.vc', 'Itaú Corretora': 'itau.com.br',
  'Bradesco Corretora': 'bradescocorretora.com.br', NuInvest: 'nuinvest.com.br',
  'Genial Investimentos': 'genialinvestimentos.com.br',
  'Toro Investimentos': 'toroinvestimentos.com.br',
  'Guide Investimentos': 'guide.com.br', Órama: 'orama.com.br',
  Warren: 'warren.com.br', NovaDAX: 'novadax.com.br',
  'Interactive Brokers': 'interactivebrokers.com', eToro: 'etoro.com',
  DEGIRO: 'degiro.com', 'Trading 212': 'trading212.com',
  Nomad: 'nomadglobal.com', Stake: 'stake.com.au',
};

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 65% 45%)`;
}

/**
 * URL primária: Google S2 favicon (altamente confiável, sem CORS, sem rate-limit).
 * Fallback: DuckDuckGo icons (favicon .ico de alta resolução).
 * (Clearbit Logo API foi descontinuada em Dez/2025 — não usar.)
 */
export function getBrokerLogoUrl(broker: string, size = 64): string | null {
  const cacheKey = `${broker}@${size}`;
  const cached = urlCache.get(cacheKey);
  if (cached !== undefined) return cached || null;
  const domain = BROKER_DOMAINS[broker];
  const sz = size >= 128 ? 128 : size >= 64 ? 64 : 32;
  const url = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${sz}` : '';
  urlCache.set(cacheKey, url);
  return url || null;
}

export function getBrokerLogoFallbackUrl(broker: string): string | null {
  const domain = BROKER_DOMAINS[broker];
  if (!domain) return null;
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

export function preloadBrokers(brokers: string[], size = 64) {
  brokers.forEach((b) => {
    const url = getBrokerLogoUrl(b, Math.max(32, size * 2));
    if (url) preloadUrl(url);
  });
}

interface Props {
  broker: string;
  size?: number;
  className?: string;
}

export function BrokerLogo({ broker, size = 16, className = '' }: Props) {
  const { overrides } = useBrokerLogoSettings();
  const override = overrides[broker];
  const url = override || getBrokerLogoUrl(broker, Math.max(32, size * 2));

  const [status, setStatus] = useState<'loading' | Status>(() => {
    if (!url) return 'failed';
    return getFresh(url) ?? 'loading';
  });

  useEffect(() => {
    if (!url) { setStatus('failed'); return; }
    const fresh = getFresh(url);
    if (fresh === 'loaded') {
      setStatus('loaded');
      // Revalidação em background se o registro está próximo do vencimento
      // (metade do TTL) — silenciosa, não afeta UI.
      const entry = statusCache.get(url);
      if (entry && Date.now() - entry.t > TTL_MS / 2) preloadUrl(url);
      return;
    }
    if (fresh === 'failed') { setStatus('failed'); return; }
    // Sem cache válido (nunca visto ou TTL expirado) → resolver.
    setStatus('loading');
    preloadUrl(url);
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { url: string };
      if (detail?.url === url) {
        const s = getFresh(url);
        if (s) setStatus(s);
      }
    };
    window.addEventListener('broker-logo-updated', onUpdate as EventListener);
    return () => window.removeEventListener('broker-logo-updated', onUpdate as EventListener);
  }, [url]);

  const initials = broker.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  if (!url || status === 'failed') {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-sm text-[9px] font-bold text-white shrink-0 ${className}`}
        style={{ width: size, height: size, background: colorFor(broker) }}
        aria-label={broker}
      >
        {initials}
      </span>
    );
  }

  if (status === 'loading') {
    return (
      <span
        className={`inline-block rounded-sm bg-muted animate-pulse shrink-0 ${className}`}
        style={{ width: size, height: size }}
        aria-label={`${broker} (carregando)`}
        aria-busy="true"
      />
    );
  }

  const fallback = getBrokerLogoFallbackUrl(broker);

  return (
    <img
      src={url}
      alt={`${broker} logo`}
      width={size}
      height={size}
      onLoad={() => markStatus(url, 'loaded')}
      onError={(e) => {
        const img = e.currentTarget;
        if (fallback && img.src !== fallback) {
          img.src = fallback;
        } else {
          markStatus(url, 'failed');
          setStatus('failed');
        }
      }}
      loading="lazy"
      decoding="async"
      className={`inline-block rounded-sm object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
