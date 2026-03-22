import { TrendingUp, TrendingDown, Wallet, BarChart3, Clock, Timer } from 'lucide-react';
import { type Asset, formatCurrency, formatPercent } from '@/lib/mockData';
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Props {
  assets: Asset[];
  lastUpdate: Date | null;
  nextUpdate?: Date | null;
}

const StatCard = ({ label, value, subValue, icon: Icon, positive }: {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  positive?: boolean | null;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
    className="rounded-lg border border-border bg-card p-3 sm:p-5"
  >
    <div className="flex items-center justify-between mb-1 sm:mb-3">
      <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
      <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
    </div>
    <p className="text-lg sm:text-2xl font-bold font-mono tracking-tight">{value}</p>
    {subValue && (
      <p className={`text-xs sm:text-sm font-mono mt-0.5 sm:mt-1 ${positive === true ? 'text-gain' : positive === false ? 'text-loss' : 'text-muted-foreground'}`}>
        {subValue}
      </p>
    )}
  </motion.div>
);

function CountdownTimer({ nextUpdate }: { nextUpdate: Date | null }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!nextUpdate) return;
    const tick = () => {
      const diff = Math.max(0, nextUpdate.getTime() - Date.now());
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setRemaining(`${min}:${sec.toString().padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [nextUpdate]);

  if (!nextUpdate) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Timer className="h-3 w-3" />
      Próx: {remaining}
    </span>
  );
}

export default function PortfolioSummary({ assets, lastUpdate, nextUpdate }: Props) {
  const { total, cost, gain, gainPct, daily, dailyPct } = useMemo(() => {
    const total = assets.reduce((s, a) => s + a.currentPrice * a.quantity, 0);
    const cost = assets.reduce((s, a) => s + a.avgPrice * a.quantity, 0);
    const gain = total - cost;
    const gainPct = cost > 0 ? (gain / cost) * 100 : 0;
    const daily = assets.reduce((s, a) => {
      const prev = a.currentPrice / (1 + a.change24h / 100);
      return s + (a.currentPrice - prev) * a.quantity;
    }, 0);
    const dailyPct = (total - daily) > 0 ? (daily / (total - daily)) * 100 : 0;
    return { total, cost, gain, gainPct, daily, dailyPct };
  }, [assets]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="col-span-2 sm:col-span-1 rounded-lg border border-border bg-card p-3 sm:p-5 glow-primary"
      >
        <div className="flex items-center justify-between mb-1 sm:mb-3">
          <span className="text-xs sm:text-sm text-muted-foreground">Patrimônio Total</span>
          <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
        </div>
        <p className="text-xl sm:text-3xl font-bold font-mono tracking-tight">{formatCurrency(total)}</p>
        <p className={`text-xs sm:text-sm font-mono mt-0.5 sm:mt-1 ${gain >= 0 ? 'text-gain' : 'text-loss'}`}>
          {formatCurrency(gain)} ({formatPercent(gainPct)})
        </p>
      </motion.div>

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

      <div className="rounded-lg border border-border bg-card p-3 sm:p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-1 sm:mb-3">
          <span className="text-xs sm:text-sm text-muted-foreground">Última Atualização</span>
          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
        </div>
        <p className="text-lg sm:text-2xl font-bold font-mono tracking-tight">
          {lastUpdate ? lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--'}
        </p>
        <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
          <p className="text-xs sm:text-sm font-mono text-muted-foreground">Auto 5 min</p>
          <CountdownTimer nextUpdate={nextUpdate || null} />
        </div>
      </div>
    </div>
  );
}
