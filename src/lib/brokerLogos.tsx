/**
 * Logos oficiais das corretoras cadastradas nos catálogos.
 * Usa favicons públicos (Google S2) para não depender de connector externo.
 * Cai para iniciais coloridas quando o domínio é desconhecido ou a imagem falha.
 */
import { useState } from 'react';

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
  const domain = BROKER_DOMAINS[broker];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
}

interface Props {
  broker: string;
  size?: number;
  className?: string;
}

export function BrokerLogo({ broker, size = 16, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const url = getBrokerLogoUrl(broker, Math.max(32, size * 2));
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
      onError={() => setFailed(true)}
      loading="lazy"
      className={`inline-block rounded-sm object-contain shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
