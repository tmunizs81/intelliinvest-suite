import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDownLeft, ArrowUpRight, History, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/mockData';
import { type CashBalanceRow } from '@/hooks/usePortfolio';

const BROKERS = [
  'XP Investimentos', 'Clear Corretora', 'Rico Investimentos', 'BTG Pactual',
  'Itaú Corretora', 'Bradesco Corretora', 'Banco do Brasil Investimentos',
  'NuInvest', 'Genial Investimentos', 'Modal Mais', 'Ágora Investimentos',
  'Toro Investimentos', 'Guide Investimentos', 'Órama', 'Warren',
  'Mercado Bitcoin', 'Binance', 'Foxbit', 'NovaDAX', 'Coinbase',
  'Terra Investimentos', 'Safra Corretora', 'Santander Corretora',
  'Avenue Securities', 'Nomad', 'Stake', 'Passfolio',
  'Interactive Brokers', 'Charles Schwab', 'TD Ameritrade',
  'XTB', 'Webull', 'eToro', 'DEGIRO', 'Trading 212',
];

interface CashMovement {
  id: string;
  type: string;
  amount: number;
  broker: string | null;
  description: string | null;
  created_at: string;
}

interface CashBalanceModalProps {
  open: boolean;
  onClose: () => void;
  cashBalances: CashBalanceRow[];
  totalBalance: number;
  onConfirm: (newBalance: number, broker: string | null, movementType?: 'deposit' | 'withdraw', movementAmount?: number) => Promise<void>;
  loadMovements: () => Promise<CashMovement[]>;
}

function BrokerAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? BROKERS.filter(b => b.toLowerCase().includes(value.toLowerCase()))
    : BROKERS;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Digite o nome da corretora"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-40 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {filtered.map((b) => (
            <button
              key={b}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => { onChange(b); setOpen(false); }}
            >
              {b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const typeLabels: Record<string, { label: string; color: string; icon: typeof ArrowDownLeft }> = {
  deposit: { label: 'Depósito', color: 'text-green-400', icon: ArrowDownLeft },
  withdraw: { label: 'Saque', color: 'text-red-400', icon: ArrowUpRight },
  sell: { label: 'Venda', color: 'text-blue-400', icon: TrendingUp },
};

export default function CashBalanceModal({ open, onClose, cashBalances, totalBalance, onConfirm, loadMovements }: CashBalanceModalProps) {
  const [tab, setTab] = useState<'manage' | 'history'>('manage');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [broker, setBroker] = useState('');
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const numAmount = parseFloat(amount) || 0;

  const selectedBrokerBalance = mode === 'withdraw' && selectedBroker !== null
    ? (cashBalances.find(c => (c.broker || '') === selectedBroker)?.balance || 0)
    : 0;

  const brokerCurrentBalance = mode === 'deposit'
    ? (cashBalances.find(c => (c.broker || '') === (broker || ''))?.balance || 0)
    : selectedBrokerBalance;

  const newBrokerBalance = mode === 'deposit'
    ? brokerCurrentBalance + numAmount
    : brokerCurrentBalance - numAmount;

  const canSubmit = numAmount > 0 && (mode === 'deposit'
    ? broker.trim().length > 0
    : selectedBroker !== null && numAmount <= selectedBrokerBalance);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const data = await loadMovements();
    setMovements(data);
    setLoadingHistory(false);
  }, [loadMovements]);

  useEffect(() => {
    if (open && tab === 'history') {
      fetchHistory();
    }
  }, [open, tab, fetchHistory]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const brokerName = mode === 'deposit' ? broker : selectedBroker;
      await onConfirm(newBrokerBalance, brokerName, mode, numAmount);
      setAmount('');
      setBroker('');
      setSelectedBroker(null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) { setAmount(''); setBroker(''); setSelectedBroker(null); setTab('manage'); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Saldo em Caixa</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          <button
            onClick={() => setTab('manage')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              tab === 'manage' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Movimentar
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              tab === 'history' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            Histórico
          </button>
        </div>

        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Total</p>
          <p className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalBalance)}</p>
        </div>

        {/* Per-broker breakdown */}
        {cashBalances.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5 max-h-32 overflow-y-auto">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Por Corretora</p>
            {cashBalances.map((cb) => (
              <div key={cb.id} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{cb.broker || 'Sem corretora'}</span>
                <span className="font-mono font-medium">{formatCurrency(cb.balance)}</span>
              </div>
            ))}
          </div>
        )}

        {/* MANAGE TAB */}
        {tab === 'manage' && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => { setMode('deposit'); setSelectedBroker(null); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  mode === 'deposit'
                    ? 'border-green-500/50 bg-green-500/10 text-green-400'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <ArrowDownLeft className="h-4 w-4" />
                Depositar
              </button>
              <button
                onClick={() => { setMode('withdraw'); setBroker(''); }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  mode === 'withdraw'
                    ? 'border-red-500/50 bg-red-500/10 text-red-400'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <ArrowUpRight className="h-4 w-4" />
                Sacar
              </button>
            </div>

            {mode === 'deposit' && (
              <div className="space-y-2">
                <Label>Corretora</Label>
                <BrokerAutocomplete value={broker} onChange={setBroker} />
              </div>
            )}

            {mode === 'withdraw' && (
              <div className="space-y-2">
                <Label>Corretora</Label>
                <div className="space-y-1">
                  {cashBalances.filter(cb => cb.balance > 0).map((cb) => (
                    <button
                      key={cb.id}
                      type="button"
                      onClick={() => setSelectedBroker(cb.broker || '')}
                      className={`w-full flex justify-between items-center rounded-lg border px-3 py-2 text-sm transition-all ${
                        selectedBroker === (cb.broker || '')
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span>{cb.broker || 'Sem corretora'}</span>
                      <span className="font-mono">{formatCurrency(cb.balance)}</span>
                    </button>
                  ))}
                  {cashBalances.filter(cb => cb.balance > 0).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">Nenhum saldo disponível</p>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {mode === 'withdraw' && selectedBroker !== null && numAmount > selectedBrokerBalance && (
                <p className="text-xs text-destructive">Saldo insuficiente nesta corretora</p>
              )}
            </div>

            {numAmount > 0 && (mode === 'deposit' ? broker.trim() : selectedBroker !== null) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Corretora</span>
                  <span>{mode === 'deposit' ? broker : (selectedBroker || 'Sem corretora')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Saldo atual</span>
                  <span className="font-mono">{formatCurrency(brokerCurrentBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{mode === 'deposit' ? 'Depósito' : 'Saque'}</span>
                  <span className={`font-mono ${mode === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                    {mode === 'deposit' ? '+' : '-'}{formatCurrency(numAmount)}
                  </span>
                </div>
                <div className="border-t border-border pt-1 flex justify-between font-medium">
                  <span>Novo saldo</span>
                  <span className="font-mono text-primary">{formatCurrency(newBrokerBalance)}</span>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
                {saving ? 'Salvando...' : mode === 'deposit' ? 'Depositar' : 'Sacar'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="space-y-2">
            {loadingHistory ? (
              <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma movimentação registrada</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {movements.map((m) => {
                  const info = typeLabels[m.type] || { label: m.type, color: 'text-foreground', icon: ArrowDownLeft };
                  const Icon = info.icon;
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                      <div className={`rounded-full p-1.5 ${
                        m.type === 'deposit' ? 'bg-green-500/10' : m.type === 'withdraw' ? 'bg-red-500/10' : 'bg-blue-500/10'
                      }`}>
                        <Icon className={`h-3.5 w-3.5 ${info.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.description || info.label}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.broker || 'Sem corretora'} • {new Date(m.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className={`font-mono text-sm font-medium ${info.color}`}>
                        {m.type === 'withdraw' ? '-' : '+'}{formatCurrency(m.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
