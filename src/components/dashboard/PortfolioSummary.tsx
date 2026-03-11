import { TrendingUp, TrendingDown, Wallet, BarChart3, Clock } from 'lucide-react';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';

interface Props {
  assets: Asset[];
  lastUpdate: Date | null;
}

const StatCard = ({ label, value, subValue, icon: Icon, positive }: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  positive?: boolean | null;
}) => (
  <div className="rounded-lg border border-border bg-card p-5 animate-fade-in">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </div>
    <p className="text-2xl font-bold font-mono tracking-tight">{value}</p>
    {subValue && (
      <p className={`text-sm font-mono mt-1 ${positive === true ? 'text-gain' : positive === false ? 'text-loss' : 'text-muted-foreground'}`}>
        {subValue}
      </p>
    )}
  </div>
);

export default function PortfolioSummary({ assets, lastUpdate }: Props) {
  const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
  const cost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
  const gain = total - cost;
  const gainPct = cost > 0 ? (gain / cost) * 100 : 0;

  const daily = assets.reduce((s, a) => {
    const prev = a.currentPrice / (1 + a.change24h / 100);
    return s + (a.currentPrice - prev) * a.quantity;
  }, 0);
  const dailyPct = (total - daily) > 0 ? (daily / (total - daily)) * 100 : 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-lg border border-border bg-card p-5 glow-primary animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">Patrimônio Total</span>
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <p className="text-3xl font-bold font-mono tracking-tight">{formatCurrency(total)}</p>
        <p className={`text-sm font-mono mt-1 ${gain >= 0 ? 'text-gain' : 'text-loss'}`}>
          {formatCurrency(gain)} ({formatPercent(gainPct)})
        </p>
      </div>

      <StatCard
        label="Variação Hoje"
        value={formatCurrency(daily)}
        subValue={formatPercent(dailyPct)}
        icon={daily >= 0 ? TrendingUp : TrendingDown}
        positive={daily >= 0}
      />

      <StatCard
        label="Lucro Total"
        value={formatCurrency(gain)}
        subValue={formatPercent(gainPct)}
        icon={BarChart3}
        positive={gain >= 0}
      />

      <StatCard
        label="Última Atualização"
        value={lastUpdate ? lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
        subValue="Yahoo Finance • 10 min"
        icon={Clock}
        positive={null}
      />
    </div>
  );
}
