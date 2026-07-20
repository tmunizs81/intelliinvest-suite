/**
 * Logos oficiais das corretoras cadastradas nos catálogos.
 * Usa favicons públicos (Google S2) para não depender de connector externo.
 * Cai para iniciais coloridas quando o domínio é desconhecido ou a imagem falha.
 *
 * Performance:
 * - URLs memoizadas (evita recomputar `?domain=...&sz=...` em cada render).
 * - Status persistido em localStorage (`loaded` | `failed`) por URL,
 *   sobrevivendo a reloads e navegação entre páginas.
 * - Preload proativo de uma lista de corretoras (top-N recentes) via `preloadBrokers`.
 * - Fallback tolerante a falhas: timeout de 6s + até 2 retentativas com backoff antes
 *   de marcar como definitivamente `failed`.
 * - Skeleton sutil enquanto a imagem resolve, para reduzir a sensação de latência.
 * - `loading="lazy"` + `decoding="async"` no <img>.
 */
import { useState, useEffect } from 'react';
import { useBrokerLogoSettings } from './brokerLogoSettings';

type Status = 'loaded' | 'failed';

// Cache em memória — sobrevive a re-renders e trocas de filtro.
const urlCache = new Map<string, string>();     // "broker@size" -> final URL
const statusCache = new Map<string, Status>();  // URL -> status
const attempts = new Map<string, number>();     // URL -> nº de tentativas
const preloading = new Set<string>();

// Persistência entre reloads.
const LS_KEY = 'broker-logo-status-v1';
const MAX_RETRIES = 2;
const TIMEOUT_MS = 6000;

// Hidrata cache a partir do localStorage (uma vez).
(function hydrate() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Status>;
    for (const [url, status] of Object.entries(parsed)) statusCache.set(url, status);
  } catch { /* ignore */ }
})();

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistDebounced() {
  if (typeof localStorage === 'undefined') return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const obj: Record<string, Status> = {};
      statusCache.forEach((v, k) => { obj[k] = v; });
      localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch { /* quota — ignore */ }
  }, 500);
}

function markStatus(url: string, status: Status) {
  statusCache.set(url, status);
  persistDebounced();
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
  if (!url || statusCache.get(url) === 'loaded' || preloading.has(url)) return;
  // Se já marcado como failed mas ainda temos retries, tentar novamente.
  const tries = attempts.get(url) ?? 0;
  if (statusCache.get(url) === 'failed' && tries >= MAX_RETRIES) return;

  preloading.add(url);
  attempts.set(url, tries + 1);

  tryLoad(url, (status) => {
    preloading.delete(url);
    if (status === 'loaded') {
      markStatus(url, 'loaded');
      window.dispatchEvent(new CustomEvent('broker-logo-updated', { detail: { url } }));
    } else {
      const currentTries = attempts.get(url) ?? 0;
      if (currentTries < MAX_RETRIES) {
        // Backoff exponencial: 800ms, 1600ms
        const delay = 800 * Math.pow(2, currentTries - 1);
        setTimeout(() => preloadUrl(url), delay);
      } else {
        markStatus(url, 'failed');
        window.dispatchEvent(new CustomEvent('broker-logo-updated', { detail: { url } }));
      }
    }
  });
}

// Domínio oficial de cada corretora suportada.
export const BROKER_DOMAINS: Record<string, string> = {
  // Stocks
  Avenue: 'avenue.us',
  XTB: 'xtb.com',
  Webull: 'webull.com',
  'C6 Bank': 'c6bank.com.br',
  'BTG Pactual': 'btgpactual.com',
  // Crypto
  Binance: 'binance.com',
  Coinbase: 'coinbase.com',
  KuCoin: 'kucoin.com',
  OKX: 'okx.com',
  Bybit: 'bybit.com',
  BingX: 'bingx.com',
  Bitget: 'bitget.com',
  'Mercado Bitcoin': 'mercadobitcoin.com.br',
  Foxbit: 'foxbit.com.br',
  // Extras
  'XP Investimentos': 'xpi.com.br',
  'Clear Corretora': 'clear.com.br',
  'Rico Investimentos': 'rico.com.vc',
  'Itaú Corretora': 'itau.com.br',
  'Bradesco Corretora': 'bradescocorretora.com.br',
  NuInvest: 'nuinvest.com.br',
  'Genial Investimentos': 'genialinvestimentos.com.br',
  'Toro Investimentos': 'toroinvestimentos.com.br',
  'Guide Investimentos': 'guide.com.br',
  Órama: 'orama.com.br',
  Warren: 'warren.com.br',
  NovaDAX: 'novadax.com.br',
  'Interactive Brokers': 'interactivebrokers.com',
  eToro: 'etoro.com',
  DEGIRO: 'degiro.com',
  'Trading 212': 'trading212.com',
  Nomad: 'nomadglobal.com',
  Stake: 'stake.com.au',
};

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 65% 45%)`;
}

export function getBrokerLogoUrl(broker: string, size = 64): string | null {
  const cacheKey = `${broker}@${size}`;
  const cached = urlCache.get(cacheKey);
  if (cached !== undefined) return cached || null;
  const domain = BROKER_DOMAINS[broker];
  const url = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}` : '';
  urlCache.set(cacheKey, url);
  return url || null;
}

/**
 * Pré-carrega logos de uma lista de corretoras (ex.: top-N no histórico recente),
 * para reduzir latência ao abrir filtros ou seletores.
 */
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

  const initial = url ? statusCache.get(url) : undefined;
  const [status, setStatus] = useState<'loading' | Status>(() => {
    if (!url) return 'failed';
    return initial ?? 'loading';
  });

  useEffect(() => {
    if (!url) { setStatus('failed'); return; }
    const cur = statusCache.get(url);
    if (cur) { setStatus(cur); return; }
    setStatus('loading');
    preloadUrl(url);
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { url: string };
      if (detail?.url === url) {
        const s = statusCache.get(url);
        if (s) setStatus(s);
      }
    };
    window.addEventListener('broker-logo-updated', onUpdate as EventListener);
    return () => window.removeEventListener('broker-logo-updated', onUpdate as EventListener);
  }, [url]);

  const initials = broker
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

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
      onError={() => { markStatus(url, 'failed'); setStatus('failed'); }}
      loading="lazy"
      decoding="async"
      className={`inline-block rounded-sm object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
