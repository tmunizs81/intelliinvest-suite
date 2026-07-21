/**
 * Logos oficiais das corretoras.
 *
 * Performance:
 * - URL canônica: Logo.dev via publishable key do conector (logo oficial).
 * - Fallbacks automáticos: Google S2 → DuckDuckGo → iniciais.
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

const LOGO_DEV_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY as string | undefined;

const LS_KEY = 'broker-logo-status-v4';
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
  Inter: 'bancointer.com.br', 'Banco Inter': 'bancointer.com.br',
  Nubank: 'nubank.com.br', 'Nu Invest': 'nubank.com.br',
  Santander: 'santander.com.br', 'Santander Corretora': 'santander.com.br',
  Safra: 'safra.com.br', 'Banco Safra': 'safra.com.br',
  Itaú: 'itau.com.br', Itau: 'itau.com.br', Bradesco: 'bradesco.com.br',
  Ágora: 'agorainvestimentos.com.br', Agora: 'agorainvestimentos.com.br',
  Modalmais: 'modalmais.com.br', Modal: 'modalmais.com.br',
  'CM Capital': 'cmcapital.com.br', 'Terra Investimentos': 'terrainvestimentos.com.br',
  'Mirae Asset': 'miraeasset.com.br', MyCAP: 'mycap.com.br',
};

const BROKER_ALIASES: Record<string, string> = {
  xp: 'XP Investimentos',
  xpinvestimentos: 'XP Investimentos',
  clear: 'Clear Corretora',
  clearcorretora: 'Clear Corretora',
  rico: 'Rico Investimentos',
  ricoinvestimentos: 'Rico Investimentos',
  btg: 'BTG Pactual',
  btgpactual: 'BTG Pactual',
  c6: 'C6 Bank',
  c6bank: 'C6 Bank',
  nuinvest: 'Nu Invest',
  nubank: 'Nubank',
  inter: 'Banco Inter',
  bancointer: 'Banco Inter',
  itau: 'Itaú',
  itaucorretora: 'Itaú Corretora',
  bradesco: 'Bradesco',
  bradescocorretora: 'Bradesco Corretora',
  agora: 'Ágora',
  agorainvestimentos: 'Ágora',
  modal: 'Modalmais',
  modalmais: 'Modalmais',
  genial: 'Genial Investimentos',
  toroinvestimentos: 'Toro Investimentos',
  toro: 'Toro Investimentos',
  guide: 'Guide Investimentos',
  warren: 'Warren',
  orama: 'Órama',
  avenue: 'Avenue',
  avenuesecurities: 'Avenue',
  binance: 'Binance',
  coinbase: 'Coinbase',
  kucoin: 'KuCoin',
  bybit: 'Bybit',
  bitget: 'Bitget',
  bingx: 'BingX',
  okx: 'OKX',
  mercadobitcoin: 'Mercado Bitcoin',
  foxbit: 'Foxbit',
};

function normalizeBrokerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function resolveBrokerDomain(broker: string): string | null {
  const trimmed = broker.trim();
  if (!trimmed) return null;

  if (BROKER_DOMAINS[trimmed]) return BROKER_DOMAINS[trimmed];

  const canonical = BROKER_ALIASES[normalizeBrokerName(trimmed)];
  if (canonical && BROKER_DOMAINS[canonical]) return BROKER_DOMAINS[canonical];

  const exactKey = Object.keys(BROKER_DOMAINS).find(
    key => normalizeBrokerName(key) === normalizeBrokerName(trimmed),
  );
  if (exactKey) return BROKER_DOMAINS[exactKey];

  // Permite cadastro livre: se o usuário salvou "corretora.com.br", usa como domínio.
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) && !trimmed.includes(' ')) return trimmed.toLowerCase();

  return null;
}

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 65% 45%)`;
}

/**
 * URL primária: Logo.dev quando o conector está disponível.
 * Fallback público: Google S2 favicon.
 * Último fallback de imagem: DuckDuckGo icons.
 */
export function getBrokerLogoUrl(broker: string, size = 64): string | null {
  const cacheKey = `${broker}@${size}`;
  const cached = urlCache.get(cacheKey);
  if (cached !== undefined) return cached || null;
  const domain = resolveBrokerDomain(broker);
  const sz = size >= 128 ? 128 : size >= 64 ? 64 : 32;
  const url = domain && LOGO_DEV_KEY
    ? `https://img.logo.dev/${domain}?token=${encodeURIComponent(LOGO_DEV_KEY)}&size=${sz}&format=png&fallback=404`
    : domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${sz}` : '';
  urlCache.set(cacheKey, url);
  return url || null;
}

function getBrokerGoogleLogoUrl(broker: string, size = 64): string | null {
  const domain = resolveBrokerDomain(broker);
  if (!domain) return null;
  const sz = size >= 128 ? 128 : size >= 64 ? 64 : 32;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${sz}`;
}

export function getBrokerLogoFallbackUrl(broker: string): string | null {
  const domain = resolveBrokerDomain(broker);
  if (!domain) return null;
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

function getLogoSources(broker: string, size: number, override?: string): string[] {
  const sources = [
    override,
    getBrokerLogoUrl(broker, size),
    getBrokerGoogleLogoUrl(broker, size),
    getBrokerLogoFallbackUrl(broker),
  ].filter((v): v is string => Boolean(v));

  return Array.from(new Set(sources));
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
  const sources = getLogoSources(broker, Math.max(32, size * 2), override);
  const [sourceIndex, setSourceIndex] = useState(0);
  const url = sources[sourceIndex] || null;

  const [status, setStatus] = useState<'loading' | Status>(() => {
    if (!url) return 'failed';
    return getFresh(url) ?? 'loading';
  });

  useEffect(() => {
    setSourceIndex(0);
  }, [broker, override, size]);

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
    if (fresh === 'failed') {
      if (sourceIndex < sources.length - 1) {
        setSourceIndex((i) => i + 1);
      } else {
        setStatus('failed');
      }
      return;
    }
    // Sem cache válido (nunca visto ou TTL expirado) → resolver.
    // Registra o listener antes do preload para evitar race condition com cache do navegador.
    setStatus('loading');
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { url: string };
      if (detail?.url === url) {
        const s = getFresh(url);
        if (s === 'failed' && sourceIndex < sources.length - 1) {
          setSourceIndex((i) => i + 1);
          return;
        }
        if (s) setStatus(s);
      }
    };
    window.addEventListener('broker-logo-updated', onUpdate as EventListener);
    preloadUrl(url);
    return () => window.removeEventListener('broker-logo-updated', onUpdate as EventListener);
  }, [url, sourceIndex, sources.length]);

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

  return (
    <img
      src={url}
      alt={`${broker} logo`}
      width={size}
      height={size}
      onLoad={() => markStatus(url, 'loaded')}
      onError={() => {
        markStatus(url, 'failed');
        if (sourceIndex < sources.length - 1) {
          setStatus('loading');
          setSourceIndex((i) => i + 1);
        } else {
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
