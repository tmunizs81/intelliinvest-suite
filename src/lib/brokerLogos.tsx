/**
 * Logos oficiais das corretoras cadastradas nos catálogos.
 * Usa favicons públicos (Google S2) para não depender de connector externo.
 * Cai para iniciais coloridas quando o domínio é desconhecido ou a imagem falha.
 *
 * Performance:
 * - URLs memoizadas (evita recomputar `?domain=...&sz=...` em cada render)
 * - Status de carregamento (`loaded` | `failed`) cacheado em memória por URL,
 *   para que trocar de filtro/broker não dispare novo request nem re-flash.
 * - `loading="lazy"` + `decoding="async"` no <img> para não bloquear layout.
 */
import { useState, useEffect } from 'react';
import { useBrokerLogoSettings } from './brokerLogoSettings';

// Cache em memória por URL — sobrevive a re-renders e trocas de filtro.
const urlCache = new Map<string, string>();                 // key -> final URL
const statusCache = new Map<string, 'loaded' | 'failed'>(); // URL -> status
const preloading = new Set<string>();

function preload(url: string) {
  if (statusCache.has(url) || preloading.has(url) || typeof Image === 'undefined') return;
  preloading.add(url);
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'lazy';
  img.onload = () => { statusCache.set(url, 'loaded'); preloading.delete(url); };
  img.onerror = () => { statusCache.set(url, 'failed'); preloading.delete(url); };
  img.src = url;
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
  // Extras comuns citados no BrokerAutocomplete
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

// Cor fallback determinística (hash simples)
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

interface Props {
  broker: string;
  size?: number;
  className?: string;
}

export function BrokerLogo({ broker, size = 16, className = '' }: Props) {
  const { overrides } = useBrokerLogoSettings();
  const override = overrides[broker];
  const url = override || getBrokerLogoUrl(broker, Math.max(32, size * 2));

  // Estado inicial reflete o cache global — evita "piscar" ao alternar filtros.
  const [failed, setFailed] = useState(() =>
    url ? statusCache.get(url) === 'failed' : true
  );

  useEffect(() => {
    if (!url) { setFailed(true); return; }
    const s = statusCache.get(url);
    if (s === 'failed') setFailed(true);
    else if (s !== 'loaded') { setFailed(false); preload(url); }
    else setFailed(false);
  }, [url]);

  const initials = broker
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (!url || failed) {
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

  return (
    <img
      src={url}
      alt={`${broker} logo`}
      width={size}
      height={size}
      onLoad={() => statusCache.set(url, 'loaded')}
      onError={() => { statusCache.set(url, 'failed'); setFailed(true); }}
      loading="lazy"
      decoding="async"
      className={`inline-block rounded-sm object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

