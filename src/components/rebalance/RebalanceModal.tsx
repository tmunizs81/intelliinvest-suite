import { useMemo, useState } from 'react';
import { X, Scale, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/lib/mockData';
import { toast } from 'sonner';

type TargetModel = 'equal-weight' | 'by-type' | 'current-normalized';

interface Order {
  ticker: string;
  name: string;
  type: string;
  broker: string | null;
  currentQty: number;
  currentValue: number;
  targetValue: number;
  deltaValue: number;
  deltaQty: number;
  price: number;
  operation: 'COMPRA' | 'VENDA' | 'MANTER';
  currentPct: number;
  targetPct: number;
}

function computeTargets(
  assets: ReturnType<typeof usePortfolio>['assets'],
  holdings: ReturnType<typeof usePortfolio>['holdings'],
  opts: { budget: number; maxWeightPct: number; minLiquidityBRL: number; model: TargetModel },
): { orders: Order[]; totalTarget: number; totalCurrent: number; excluded: string[] } {
  const excluded: string[] = [];
  const enriched = assets.map(a => {
    const h = holdings.find(x => x.ticker.toUpperCase() === a.ticker.toUpperCase());
    return { ...a, broker: h?.broker || null, value: a.currentPrice * a.quantity };
  }).filter(a => {
    if (a.value < opts.minLiquidityBRL) { excluded.push(a.ticker); return false; }
    return true;
  });

  const totalCurrent = enriched.reduce((s, a) => s + a.value, 0);
  const totalTarget = totalCurrent + opts.budget;
  if (!enriched.length || totalTarget <= 0) {
    return { orders: [], totalTarget, totalCurrent, excluded };
  }

  // 1. Base target weights per model
  let weights: Record<string, number> = {};
  if (opts.model === 'equal-weight') {
    const w = 1 / enriched.length;
    enriched.forEach(a => { weights[a.ticker] = w; });
  } else if (opts.model === 'current-normalized') {
    enriched.forEach(a => { weights[a.ticker] = a.value / totalCurrent; });
  } else {
    // by-type: distribui igualmente entre tipos e depois igualmente entre ativos dentro do tipo
    const byType: Record<string, string[]> = {};
    enriched.forEach(a => {
      const t = a.type || 'N/A';
      (byType[t] ||= []).push(a.ticker);
    });
    const types = Object.keys(byType);
    const typeW = 1 / types.length;
    for (const t of types) {
      const inside = byType[t];
      const per = typeW / inside.length;
      inside.forEach(tk => { weights[tk] = per; });
    }
  }

  // 2. Aplica cap por ativo (maxWeightPct) e redistribui o excedente
  const maxW = Math.min(1, Math.max(0.01, opts.maxWeightPct / 100));
  for (let iter = 0; iter < 5; iter++) {
    let overflow = 0;
    const notCapped: string[] = [];
    for (const t of Object.keys(weights)) {
      if (weights[t] > maxW) {
        overflow += weights[t] - maxW;
        weights[t] = maxW;
      } else {
        notCapped.push(t);
      }
    }
    if (overflow < 1e-6 || !notCapped.length) break;
    const totalNC = notCapped.reduce((s, t) => s + weights[t], 0);
    if (totalNC <= 0) break;
    for (const t of notCapped) weights[t] += overflow * (weights[t] / totalNC);
  }

  const orders: Order[] = enriched.map(a => {
    const w = weights[a.ticker] ?? 0;
    const targetValue = totalTarget * w;
    const deltaValue = targetValue - a.value;
    const deltaQty = a.currentPrice > 0 ? deltaValue / a.currentPrice : 0;
    const op: Order['operation'] =
      Math.abs(deltaValue) < Math.max(50, totalTarget * 0.005) ? 'MANTER' :
      deltaValue > 0 ? 'COMPRA' : 'VENDA';
    return {
      ticker: a.ticker, name: a.name, type: a.type, broker: a.broker,
      currentQty: a.quantity, currentValue: a.value,
      targetValue, deltaValue, deltaQty, price: a.currentPrice,
      operation: op,
      currentPct: totalCurrent > 0 ? (a.value / totalCurrent) * 100 : 0,
      targetPct: w * 100,
    };
  }).sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue));

  return { orders, totalTarget, totalCurrent, excluded };
}

export function RebalanceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { assets, holdings, refresh } = usePortfolio();
  const [model, setModel] = useState<TargetModel>('equal-weight');
  const [budget, setBudget] = useState<number>(0);
  const [maxWeightPct, setMaxWeightPct] = useState<number>(15);
  const [minLiquidityBRL, setMinLiquidityBRL] = useState<number>(100);
  const [applying, setApplying] = useState(false);

  const { orders, totalTarget, totalCurrent, excluded } = useMemo(
    () => computeTargets(assets, holdings, { budget, maxWeightPct, minLiquidityBRL, model }),
    [assets, holdings, budget, maxWeightPct, minLiquidityBRL, model],
  );

  const buys = orders.filter(o => o.operation === 'COMPRA');
  const sells = orders.filter(o => o.operation === 'VENDA');
  const totalBuy = buys.reduce((s, o) => s + o.deltaValue, 0);
  const totalSell = sells.reduce((s, o) => s + Math.abs(o.deltaValue), 0);
  const netCashNeeded = totalBuy - totalSell;

  const apply = async () => {
    if (!user) return;
    const actionable = orders.filter(o => o.operation !== 'MANTER');
    if (!actionable.length) { toast.info('Nada a rebalancear.'); return; }
    if (!confirm(`Confirmar ${actionable.length} operações de rebalanceamento?`)) return;
    setApplying(true);
    try {
      const rows = actionable.map(o => ({
        ticker: o.ticker,
        name: o.name,
        type: o.type,
        operation: o.operation,
        quantity: Math.abs(+o.deltaQty.toFixed(6)),
        price: o.price,
        fees: 0,
        date: new Date().toISOString().split('T')[0],
        broker: o.broker,
        notes: `Rebalanceamento IA (${model}) — alvo ${o.targetPct.toFixed(1)}%`,
      })).filter(r => r.quantity > 0);
      const { error } = await supabase.rpc('import_transactions_atomic', { _rows: rows as never });
      if (error) throw error;
      toast.success(`Rebalanceamento aplicado: ${rows.length} operações`);
      await refresh();
      onClose();
    } catch (e: any) {
      toast.error('Falha ao aplicar: ' + (e?.message || 'erro'));
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-5xl max-h-[90vh] rounded-xl bg-card border border-border shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Rebalanceamento de carteira</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Constraints */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Modelo alvo</span>
              <select value={model} onChange={(e) => setModel(e.target.value as TargetModel)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm">
                <option value="equal-weight">Peso igual</option>
                <option value="by-type">Igual por tipo</option>
                <option value="current-normalized">Manter proporções atuais</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Orçamento adicional (R$)</span>
              <input type="number" step="100" value={budget}
                onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Limite por ativo (%)</span>
              <input type="number" step="1" min="1" max="100" value={maxWeightPct}
                onChange={(e) => setMaxWeightPct(parseFloat(e.target.value) || 15)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm font-mono" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Liquidez mín. (R$)</span>
              <input type="number" step="50" value={minLiquidityBRL}
                onChange={(e) => setMinLiquidityBRL(parseFloat(e.target.value) || 0)}
                className="h-9 rounded-md border border-border bg-background px-2 text-sm font-mono" />
            </label>
          </div>

          {/* Impact summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Patrimônio atual</div>
              <div className="font-mono font-semibold">{formatCurrency(totalCurrent)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Patrimônio alvo</div>
              <div className="font-mono font-semibold">{formatCurrency(totalTarget)}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Total compras / vendas</div>
              <div className="font-mono font-semibold text-xs">
                <span className="text-emerald-500">+{formatCurrency(totalBuy)}</span> /
                <span className="text-red-500 ml-1">-{formatCurrency(totalSell)}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="text-[10px] uppercase text-muted-foreground">Caixa líquido necessário</div>
              <div className={`font-mono font-semibold ${netCashNeeded > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                {formatCurrency(netCashNeeded)}
              </div>
            </div>
          </div>

          {excluded.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span>Excluídos por liquidez &lt; R${minLiquidityBRL}: {excluded.join(', ')}</span>
            </div>
          )}

          {/* Orders table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Ticker</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Atual %</th>
                  <th className="text-right p-2">Alvo %</th>
                  <th className="text-right p-2">Δ Valor</th>
                  <th className="text-right p-2">Δ Qtd</th>
                  <th className="text-center p-2">Operação</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.ticker} className="border-t border-border/50">
                    <td className="p-2 font-mono font-semibold">{o.ticker}</td>
                    <td className="p-2 text-muted-foreground">{o.type}</td>
                    <td className="p-2 text-right font-mono">{o.currentPct.toFixed(1)}%</td>
                    <td className="p-2 text-right font-mono">
                      <span className="inline-flex items-center gap-1">
                        {o.targetPct.toFixed(1)}%
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      </span>
                    </td>
                    <td className={`p-2 text-right font-mono ${o.deltaValue >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {o.deltaValue >= 0 ? '+' : ''}{formatCurrency(o.deltaValue)}
                    </td>
                    <td className="p-2 text-right font-mono">{o.deltaQty.toFixed(4)}</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        o.operation === 'COMPRA' ? 'bg-emerald-500/20 text-emerald-500' :
                        o.operation === 'VENDA' ? 'bg-red-500/20 text-red-500' :
                        'bg-muted text-muted-foreground'
                      }`}>{o.operation}</span>
                    </td>
                  </tr>
                ))}
                {!orders.length && (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum ativo elegível.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={applying || !orders.some(o => o.operation !== 'MANTER')}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            Aplicar rebalanceamento
          </button>
        </div>
      </div>
    </div>
  );
}
