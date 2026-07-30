import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, X, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { BrokerLogo } from '@/lib/brokerLogos';
import { formatCurrency } from '@/lib/mockData';
import {
  reconciliationGroups,
  validateReassignment,
  brokerLabel,
  normalizeBroker,
  type HoldingLike,
} from '@/lib/holdingsIsolation';
import type { HoldingRow } from '@/hooks/usePortfolio';

interface Props {
  open: boolean;
  onClose: () => void;
  holdings: HoldingRow[];
  knownBrokers: string[];
  onReassign: (holdingId: string, broker: string | null) => Promise<void>;
}

/**
 * Reconciliação de corretoras.
 *
 * Mostra todo ticker que aparece em mais de uma corretora ou que está sem
 * corretora definida, e permite reatribuir cada lote individualmente.
 * Nenhum merge automático acontece aqui: o usuário decide lote a lote.
 */
export default function BrokerReconciliationModal({ open, onClose, holdings, knownBrokers, onReassign }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const groups = useMemo(
    () => reconciliationGroups(holdings as unknown as HoldingLike[]),
    [holdings],
  );

  if (!open) return null;

  const pendingLots = groups.reduce((s, g) => s + g.lots.length, 0);

  const handleSave = async (holdingId: string) => {
    const target = normalizeBroker(drafts[holdingId] ?? '');
    const check = validateReassignment(holdings as unknown as HoldingLike[], holdingId, target);
    if (!check.ok) {
      toast.error(check.reason || 'Reatribuição inválida');
      return;
    }
    setSavingId(holdingId);
    try {
      await onReassign(holdingId, target);
      setDrafts(prev => {
        const next = { ...prev };
        delete next[holdingId];
        return next;
      });
      toast.success(`Posição movida para ${brokerLabel(target)}`);
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao reatribuir corretora');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Reconciliação de corretoras
            </h2>
            <p className="mt-1 text-xs text-muted-foreground max-w-xl">
              Revise os lotes antes de qualquer unificação. Cada linha é uma posição independente
              — o mesmo ticker em corretoras diferentes nunca é fundido automaticamente.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Fechar reconciliação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <datalist id="reconcile-broker-list">
          {knownBrokers.map(b => <option key={b} value={b} />)}
        </datalist>

        <div className="max-h-[65vh] overflow-y-auto p-5 space-y-5">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <ShieldCheck className="h-8 w-8 text-emerald-500" />
              <p className="text-sm font-medium">Nenhuma inconsistência encontrada</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Todos os ativos estão atribuídos a uma corretora e não há tickers duplicados
                aguardando decisão.
              </p>
            </div>
          ) : (
            groups.map(group => (
              <div key={group.ticker} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                  <span className="font-mono font-semibold">{group.ticker}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {group.lots.length} lotes em {group.brokers.join(', ')}
                  </span>
                  {group.hasUnassigned && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                      sem corretora
                    </span>
                  )}
                  {group.isSplit && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      dividido
                    </span>
                  )}
                </div>

                <div className="divide-y divide-border">
                  {group.lots.map(lot => {
                    const row = holdings.find(h => h.id === lot.id)!;
                    const current = normalizeBroker(row.broker);
                    const draft = drafts[row.id];
                    const dirty = draft !== undefined && normalizeBroker(draft) !== current;
                    return (
                      <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                        <div className="flex items-center gap-2 min-w-[170px]">
                          {current ? <BrokerLogo broker={current} size={18} /> : <span className="h-[18px] w-[18px] rounded bg-muted" />}
                          <span className={current ? '' : 'text-amber-500'}>{brokerLabel(current)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono min-w-[150px]">
                          {row.quantity} un · PM {formatCurrency(row.avg_price)}
                        </div>
                        <input
                          list="reconcile-broker-list"
                          value={draft ?? current ?? ''}
                          onChange={e => setDrafts(prev => ({ ...prev, [row.id]: e.target.value }))}
                          placeholder="Nova corretora"
                          className="flex-1 min-w-[160px] rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          onClick={() => handleSave(row.id)}
                          disabled={!dirty || savingId === row.id}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40 hover:opacity-90 transition-opacity"
                        >
                          {savingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          Reatribuir
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border p-4">
          <span className="text-xs text-muted-foreground">
            {groups.length === 0
              ? 'Carteira consistente'
              : `${groups.length} ticker(s) · ${pendingLots} lote(s) para revisar`}
          </span>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}
