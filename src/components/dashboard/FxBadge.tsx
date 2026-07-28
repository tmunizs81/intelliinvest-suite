import { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency';

interface Props {
  /** compact = only icon+time, no rate math shown */
  compact?: boolean;
  className?: string;
}

/**
 * Single source of truth for the FX snapshot displayed across the dashboard.
 * Every metric on screen uses the exact FX from `useDisplayCurrency`, so the
 * timestamp shown here matches the numbers next to it (no cotação-mix).
 */
export const FxBadge = memo(function FxBadge({ compact = false, className = '' }: Props) {
  const { currency, fx, fxUpdatedAt, refreshFx, fxRefreshing } = useDisplayCurrency();
  if (currency === 'BRL') {
    return (
      <button
        type="button"
        onClick={() => refreshFx()}
        disabled={fxRefreshing}
        title="Atualizar cotação FX agora"
        className={`inline-flex items-center gap-1 rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition ${className}`}
      >
        <RefreshCw className={`h-3 w-3 ${fxRefreshing ? 'animate-spin' : ''}`} />
        FX
      </button>
    );
  }
  const rate = currency === 'USD' ? fx.USD_BRL : fx.EUR_BRL;
  const time = fxUpdatedAt
    ? new Date(fxUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const full = `1 ${currency} = R$ ${rate.toFixed(4)} · ${time}`;
  return (
    <button
      type="button"
      onClick={() => refreshFx()}
      disabled={fxRefreshing}
      title={`Cotação usada em toda a tela. Clique para atualizar. ${full}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition disabled:opacity-60 ${className}`}
    >
      <RefreshCw className={`h-3 w-3 ${fxRefreshing ? 'animate-spin' : ''}`} />
      {compact ? time : full}
    </button>
  );
});
