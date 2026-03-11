import { useMemo } from 'react';
import { Landmark, CalendarClock, TrendingUp, AlertTriangle, Wallet } from 'lucide-react';
import { type Asset } from '@/lib/mockData';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  assets: Asset[];
}

const FIXED_INCOME_SUBTYPES = ['CDB', 'LCI', 'LCA', 'Tesouro Selic', 'Tesouro IPCA+', 'Tesouro Pré', 'Debênture', 'CRI', 'CRA', 'LC'];

export default function FixedIncomePanel({ assets }: Props) {
  const fixedAssets = useMemo(() => {
    return assets.filter(a => a.type === 'Renda Fixa');
  }, [assets]);

  const summary = useMemo(() => {
    const totalInvested = fixedAssets.reduce((sum, a) => sum + (a.avgPrice * a.quantity), 0);
    const totalCurrent = fixedAssets.reduce((sum, a) => sum + (a.currentPrice * a.quantity), 0);
    const totalGain = totalCurrent - totalInvested;
    const avgReturn = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

    // Group by subtype (stored in sector field)
    const bySubtype: Record<string, { count: number; invested: number; current: number }> = {};
    for (const a of fixedAssets) {
      const subtype = a.sector || 'Outros';
      if (!bySubtype[subtype]) bySubtype[subtype] = { count: 0, invested: 0, current: 0 };
      bySubtype[subtype].count++;
      bySubtype[subtype].invested += a.avgPrice * a.quantity;
      bySubtype[subtype].current += a.currentPrice * a.quantity;
    }

    // Upcoming maturities
    const withMaturity = fixedAssets
      .filter(a => (a as any).maturityDate)
      .map(a => ({
        ...a,
        maturityDate: parseISO((a as any).maturityDate),
        daysLeft: differenceInDays(parseISO((a as any).maturityDate), new Date()),
      }))
      .filter(a => a.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return { totalInvested, totalCurrent, totalGain, avgReturn, bySubtype, withMaturity, count: fixedAssets.length };
  }, [fixedAssets]);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (summary.count === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
        <Landmark className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Nenhum ativo de Renda Fixa na carteira.
        </p>
        <p className="text-xs text-muted-foreground/60">
          Adicione CDBs, LCIs, LCAs ou Tesouro Direto para ver o resumo aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-muted/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-medium">Total Investido</span>
          </div>
          <p className="text-sm font-semibold font-mono">{formatCurrency(summary.totalInvested)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-medium">Valor Atual</span>
          </div>
          <p className="text-sm font-semibold font-mono">{formatCurrency(summary.totalCurrent)}</p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-medium">Ganho/Perda</span>
          </div>
          <p className={`text-sm font-semibold font-mono ${summary.totalGain >= 0 ? 'text-gain' : 'text-loss'}`}>
            {summary.totalGain >= 0 ? '+' : ''}{formatCurrency(summary.totalGain)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[10px] uppercase tracking-wider font-medium">Rent. Média</span>
          </div>
          <p className={`text-sm font-semibold font-mono ${summary.avgReturn >= 0 ? 'text-gain' : 'text-loss'}`}>
            {summary.avgReturn >= 0 ? '+' : ''}{summary.avgReturn.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* By subtype */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Por Tipo</h4>
        <div className="space-y-1.5">
          {Object.entries(summary.bySubtype)
            .sort((a, b) => b[1].invested - a[1].invested)
            .map(([subtype, data]) => {
              const pct = summary.totalInvested > 0 ? (data.invested / summary.totalInvested) * 100 : 0;
              const ret = data.invested > 0 ? ((data.current - data.invested) / data.invested) * 100 : 0;
              return (
                <div key={subtype} className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-xs font-medium">{subtype}</span>
                    <span className="text-[10px] text-muted-foreground">({data.count})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono">{formatCurrency(data.invested)}</span>
                    <span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
                    <span className={`text-[10px] font-mono ${ret >= 0 ? 'text-gain' : 'text-loss'}`}>
                      {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Upcoming maturities */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Próximos Vencimentos
        </h4>
        {summary.withMaturity.length === 0 ? (
          <p className="text-xs text-muted-foreground/60 italic">Nenhuma data de vencimento cadastrada.</p>
        ) : (
          <div className="space-y-1.5">
            {summary.withMaturity.slice(0, 6).map((a) => {
              const isUrgent = a.daysLeft <= 30;
              const isWarning = a.daysLeft <= 90;
              return (
                <div key={a.ticker} className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  isUrgent ? 'bg-loss/10 border border-loss/20' : isWarning ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-muted/20'
                }`}>
                  <div className="flex items-center gap-2">
                    {isUrgent && <AlertTriangle className="h-3.5 w-3.5 text-loss" />}
                    <div>
                      <p className="text-xs font-medium">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{a.ticker} • {(a as any).sector || ''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono">{format(a.maturityDate, "dd/MM/yyyy", { locale: ptBR })}</p>
                    <p className={`text-[10px] font-mono ${isUrgent ? 'text-loss' : isWarning ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                      {a.daysLeft === 0 ? 'Vence hoje!' : `${a.daysLeft} dias`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
