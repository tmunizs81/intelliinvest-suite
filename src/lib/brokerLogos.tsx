/**
 * Logos de corretoras com entrega determinística.
 *
 * Estratégia DevOps:
 * - Corretoras críticas usam SVG local em data URI: não depende de CDN,
 *   favicon, CORS, ad-blocker, variáveis de ambiente ou cache externo.
 * - Logo.dev/Google/DuckDuckGo ficam apenas para corretoras desconhecidas.
 * - Cache persistente só vale para fontes remotas; logo local renderiza na hora.
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

const LS_KEY = 'broker-logo-status-v5';
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

/**
 * Purga entradas de cache (memória + localStorage) para uma corretora.
 * Chamada quando o usuário sobrescreve/reseta a logo — garante que a
 * próxima renderização use a nova URL sem servir bytes obsoletos.
 */
export function purgeBrokerLogoCache(broker: string) {
  const prefix = `${broker}@`;
  for (const key of Array.from(urlCache.keys())) {
    if (key.startsWith(prefix)) {
      const url = urlCache.get(key);
      urlCache.delete(key);
      if (url) { statusCache.delete(url); attempts.delete(url); }
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
        // Sem chave por broker no LS — reescrevemos apenas com o que sobrou em memória.
        const obj: Record<string, CacheEntry> = {};
        statusCache.forEach((v, k) => { obj[k] = v; });
        localStorage.setItem(LS_KEY, JSON.stringify(obj));
        void parsed;
      }
    }
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('broker-logo-updated', { detail: { url: `purge:${broker}` } }));
  }
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
  'Banco do Brasil': 'bb.com.br', 'BB Investimentos': 'bb.com.br',
  Caixa: 'caixa.gov.br', 'Caixa Econômica': 'caixa.gov.br',
  'Daycoval': 'daycoval.com.br', 'Banco Daycoval': 'daycoval.com.br',
  'Órama DTVM': 'orama.com.br', Planner: 'planner.com.br',
  'Ativa Investimentos': 'ativainvestimentos.com.br',
  Easynvest: 'easynvest.com.br',
  'T2-HOLDINGS': 't2holdings.com.br',
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
  bancoc6: 'C6 Bank',
  bancoc6sa: 'C6 Bank',
  c6sa: 'C6 Bank',
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
  xpctvm: 'XP Investimentos',
  xpinc: 'XP Investimentos',
  xpinvestimentosctvm: 'XP Investimentos',
  xpctvmsa: 'XP Investimentos',
  clearctvm: 'Clear Corretora',
  ricoctvm: 'Rico Investimentos',
  btgpactualdigital: 'BTG Pactual',
  btgpactualctvm: 'BTG Pactual',
  interdtvm: 'Banco Inter',
  c6ctvm: 'C6 Bank',
  genialctvm: 'Genial Investimentos',
  bancodobrasil: 'Banco do Brasil',
  bbinvestimentos: 'BB Investimentos',
  caixa: 'Caixa',
  caixaeconomica: 'Caixa Econômica',
  daycoval: 'Daycoval',
  bancodaycoval: 'Banco Daycoval',
  planner: 'Planner',
  ativa: 'Ativa Investimentos',
  ativainvestimentos: 'Ativa Investimentos',
  easynvest: 'Easynvest',
  t2: 'T2-HOLDINGS',
  t2holdings: 'T2-HOLDINGS',
};

const LOCAL_LOGO_BY_CANONICAL: Record<string, { bg: string; fg: string; text: string; sub?: string; ring?: string }> = {
  'BTG Pactual': { bg: '#071D49', fg: '#FFFFFF', text: 'btg', sub: 'pactual', ring: '#15B87A' },
  XTB: { bg: '#D71920', fg: '#FFFFFF', text: 'XTB' },
  Webull: { bg: '#0F55FF', fg: '#FFFFFF', text: 'WB' },
  'C6 Bank': { bg: '#111827', fg: '#FFFFFF', text: 'C6', sub: 'bank', ring: '#C6A35B' },
  'Banco Inter': { bg: '#FF7A00', fg: '#FFFFFF', text: 'inter' },
  'XP Investimentos': { bg: '#111111', fg: '#FFFFFF', text: 'XP', ring: '#D6A33A' },
  Coinbase: { bg: '#0052FF', fg: '#FFFFFF', text: 'C' },
  Avenue: { bg: '#111827', fg: '#FFFFFF', text: 'AV', ring: '#48D597' },
  Binance: { bg: '#F0B90B', fg: '#111111', text: 'BNB' },
  OKX: { bg: '#111111', fg: '#FFFFFF', text: 'OKX' },
  Bybit: { bg: '#F7A600', fg: '#111111', text: 'BY' },
  Bitget: { bg: '#00F0FF', fg: '#0B1220', text: 'BG' },
  BingX: { bg: '#0B69FF', fg: '#FFFFFF', text: 'BX' },
  KuCoin: { bg: '#23AF91', fg: '#FFFFFF', text: 'KC' },
  'Mercado Bitcoin': { bg: '#F7931A', fg: '#111111', text: 'MB' },
  Foxbit: { bg: '#FF6B00', fg: '#FFFFFF', text: 'FB' },
  'Clear Corretora': { bg: '#F15A24', fg: '#FFFFFF', text: 'clear' },
  'Rico Investimentos': { bg: '#00A859', fg: '#FFFFFF', text: 'rico' },
  'Itaú Corretora': { bg: '#EC7000', fg: '#FFFFFF', text: 'itaú' },
  Itaú: { bg: '#EC7000', fg: '#FFFFFF', text: 'itaú' },
  Bradesco: { bg: '#C8102E', fg: '#FFFFFF', text: 'bra' },
  'Bradesco Corretora': { bg: '#C8102E', fg: '#FFFFFF', text: 'bra' },
  Nubank: { bg: '#820AD1', fg: '#FFFFFF', text: 'nu' },
  'Nu Invest': { bg: '#820AD1', fg: '#FFFFFF', text: 'nu' },
  Santander: { bg: '#EC0000', fg: '#FFFFFF', text: 'SAN' },
  'Santander Corretora': { bg: '#EC0000', fg: '#FFFFFF', text: 'SAN' },
  Safra: { bg: '#0F2F57', fg: '#FFFFFF', text: 'safra' },
  'Banco Safra': { bg: '#0F2F57', fg: '#FFFFFF', text: 'safra' },
  Ágora: { bg: '#FFB000', fg: '#111111', text: 'ág' },
  Modalmais: { bg: '#0B1F3A', fg: '#FFFFFF', text: 'modal' },
  'Genial Investimentos': { bg: '#08A8E8', fg: '#FFFFFF', text: 'genial' },
  'Toro Investimentos': { bg: '#00A651', fg: '#FFFFFF', text: 'toro' },
  'Guide Investimentos': { bg: '#2B5BDB', fg: '#FFFFFF', text: 'guide' },
  Warren: { bg: '#E83E5A', fg: '#FFFFFF', text: 'W' },
  Órama: { bg: '#00AEEF', fg: '#FFFFFF', text: 'órama' },
  'Banco do Brasil': { bg: '#FDE100', fg: '#0038A8', text: 'BB' },
  'BB Investimentos': { bg: '#FDE100', fg: '#0038A8', text: 'BB' },
  Caixa: { bg: '#005CA9', fg: '#FFFFFF', text: 'caixa', ring: '#F39200' },
  'Interactive Brokers': { bg: '#101820', fg: '#FFFFFF', text: 'IBKR', ring: '#C8102E' },
  eToro: { bg: '#67D300', fg: '#111111', text: 'etoro' },
  DEGIRO: { bg: '#0098D8', fg: '#FFFFFF', text: 'degiro' },
  'Trading 212': { bg: '#0B63F6', fg: '#FFFFFF', text: '212' },
  Nomad: { bg: '#111827', fg: '#FFFFFF', text: 'nomad' },
  Stake: { bg: '#111827', fg: '#FFFFFF', text: 'stake' },
  'T2-HOLDINGS': { bg: '#C97A16', fg: '#FFFFFF', text: 'T2' },
};

function normalizeBrokerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function resolveBrokerCanonicalName(broker: string): string | null {
  const trimmed = broker.trim();
  if (!trimmed) return null;
  const normalized = normalizeBrokerName(trimmed);

  if (BROKER_DOMAINS[trimmed] || LOCAL_LOGO_BY_CANONICAL[trimmed]) return trimmed;

  const canonical = BROKER_ALIASES[normalized];
  if (canonical) return canonical;

  const exactKey = Object.keys({ ...BROKER_DOMAINS, ...LOCAL_LOGO_BY_CANONICAL }).find(
    key => normalizeBrokerName(key) === normalized,
  );
  if (exactKey) return exactKey;

  const aliasHit = Object.entries(BROKER_ALIASES).find(([alias]) => {
    if (alias.length < 3) return false;
    return normalized.includes(alias) || alias.includes(normalized);
  });
  if (aliasHit) return aliasHit[1];

  const knownHit = Object.keys({ ...BROKER_DOMAINS, ...LOCAL_LOGO_BY_CANONICAL }).find((key) => {
    const nk = normalizeBrokerName(key);
    return nk.length >= 3 && (normalized.includes(nk) || nk.includes(normalized));
  });
  return knownHit || null;
}

function resolveBrokerDomain(broker: string): string | null {
  const trimmed = broker.trim();
  if (!trimmed) return null;
  const normalized = normalizeBrokerName(trimmed);

  if (BROKER_DOMAINS[trimmed]) return BROKER_DOMAINS[trimmed];

  const canonical = BROKER_ALIASES[normalized];
  if (canonical && BROKER_DOMAINS[canonical]) return BROKER_DOMAINS[canonical];

  const exactKey = Object.keys(BROKER_DOMAINS).find(
    key => normalizeBrokerName(key) === normalized,
  );
  if (exactKey) return BROKER_DOMAINS[exactKey];

  // Nomes importados de notas vêm verbosos: "XP Investimentos CCTVM S.A.",
  // "Inter DTVM", "BTG Pactual Digital". Faz match por substring normalizada.
  const aliasHit = Object.entries(BROKER_ALIASES).find(([alias]) => {
    if (alias.length < 3) return false;
    return normalized.includes(alias) || alias.includes(normalized);
  });
  if (aliasHit) {
    const mapped = BROKER_DOMAINS[aliasHit[1]];
    if (mapped) return mapped;
  }

  const domainHit = Object.keys(BROKER_DOMAINS).find((key) => {
    const nk = normalizeBrokerName(key);
    return nk.length >= 3 && (normalized.includes(nk) || nk.includes(normalized));
  });
  if (domainHit) return BROKER_DOMAINS[domainHit];

  // Permite cadastro livre: se o usuário salvou "corretora.com.br", usa como domínio.
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) && !trimmed.includes(' ')) return trimmed.toLowerCase();

  return null;
}

function makeLocalLogoDataUri(brand: { bg: string; fg: string; text: string; sub?: string; ring?: string }): string {
  const text = brand.text.length <= 2 ? brand.text : brand.text.toLowerCase();
  const mainSize = text.length <= 2 ? 38 : text.length <= 4 ? 25 : 18;
  const y = brand.sub ? 42 : 34;
  const sub = brand.sub
    ? `<text x="32" y="54" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="8" font-weight="700" fill="${brand.fg}" opacity="0.82">${brand.sub}</text>`
    : '';
  const ring = brand.ring
    ? `<path d="M8 49 C18 61 45 61 56 44" fill="none" stroke="${brand.ring}" stroke-width="5" stroke-linecap="round" opacity="0.95"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"><rect width="64" height="64" rx="14" fill="${brand.bg}"/>${ring}<text x="32" y="${y}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${mainSize}" font-weight="900" fill="${brand.fg}" letter-spacing="0">${text}</text>${sub}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getLocalBrokerLogoUrl(broker: string): string | null {
  const canonical = resolveBrokerCanonicalName(broker);
  if (!canonical) return null;
  const brand = LOCAL_LOGO_BY_CANONICAL[canonical];
  return brand ? makeLocalLogoDataUri(brand) : null;
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
    getLocalBrokerLogoUrl(broker),
    getBrokerLogoUrl(broker, size),
    getBrokerGoogleLogoUrl(broker, size),
    getBrokerLogoFallbackUrl(broker),
  ].filter((v): v is string => Boolean(v));

  return Array.from(new Set(sources));
}

export function preloadBrokers(brokers: string[], size = 64) {
  brokers.forEach((b) => {
    if (getLocalBrokerLogoUrl(b)) return;
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
  const isLocal = Boolean(url?.startsWith('data:image/svg+xml'));

  const [status, setStatus] = useState<'loading' | Status>(() => {
    if (!url) return 'failed';
    if (url.startsWith('data:image/svg+xml')) return 'loaded';
    return getFresh(url) ?? 'loading';
  });

  useEffect(() => {
    setSourceIndex(0);
  }, [broker, override, size]);

  useEffect(() => {
    if (!url) { setStatus('failed'); return; }
    if (url.startsWith('data:image/svg+xml')) { setStatus('loaded'); return; }
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
        data-broker-logo={broker}
        data-broker-logo-source="fallback-initials"
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
        data-broker-logo={broker}
        data-broker-logo-source="remote-loading"
        className={`inline-block rounded-sm bg-muted animate-pulse shrink-0 ${className}`}
        style={{ width: size, height: size }}
        aria-label={`${broker} (carregando)`}
        aria-busy="true"
      />
    );
  }

  return (
    <img
      data-broker-logo={broker}
      data-broker-logo-source={isLocal ? 'local-svg' : 'remote'}
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
