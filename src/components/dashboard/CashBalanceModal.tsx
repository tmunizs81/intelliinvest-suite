import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@/lib/mockData';

const BROKERS = [
  'XP Investimentos', 'Clear Corretora', 'Rico Investimentos', 'BTG Pactual',
  'Itaú Corretora', 'Bradesco Corretora', 'Banco do Brasil Investimentos',
  'NuInvest (Easynvest)', 'Inter Invest', 'Ágora Investimentos', 'Genial Investimentos',
  'Modal Mais', 'Guide Investimentos', 'Órama', 'Toro Investimentos',
  'C6 Invest', 'Warren', 'Mercado Bitcoin', 'Binance', 'Foxbit',
  'Terra Investimentos', 'Safra Corretora', 'Santander Corretora',
  'Avenue Securities', 'Nomad', 'Stake', 'Passfolio',
  'Interactive Brokers', 'Charles Schwab', 'TD Ameritrade',
];

interface CashBalanceModalProps {
  open: boolean;
  onClose: () => void;
  currentBalance: number;
  onConfirm: (newBalance: number) => Promise<void>;
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

export default function CashBalanceModal({ open, onClose, currentBalance, onConfirm }: CashBalanceModalProps) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('');
  const [broker, setBroker] = useState('');
  const [saving, setSaving] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const newBalance = mode === 'deposit' ? currentBalance + numAmount : currentBalance - numAmount;
  const canSubmit = numAmount > 0 && (mode === 'deposit' || numAmount <= currentBalance);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await onConfirm(newBalance);
      setAmount('');
      setBroker('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) { setAmount(''); setBroker(''); onClose(); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Saldo em Caixa</DialogTitle>
        </DialogHeader>

        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Saldo Atual</p>
          <p className="text-2xl font-bold font-mono text-primary">{formatCurrency(currentBalance)}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode('deposit')}
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
            onClick={() => setMode('withdraw')}
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

        <div className="space-y-2">
          <Label>Valor (R$)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          {mode === 'withdraw' && numAmount > currentBalance && (
            <p className="text-xs text-destructive">Saldo insuficiente</p>
          )}
        </div>

        {mode === 'deposit' && (
          <div className="space-y-2">
            <Label>Corretora</Label>
            <BrokerAutocomplete value={broker} onChange={setBroker} />
          </div>
        )}

        {numAmount > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saldo atual</span>
              <span className="font-mono">{formatCurrency(currentBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{mode === 'deposit' ? 'Depósito' : 'Saque'}</span>
              <span className={`font-mono ${mode === 'deposit' ? 'text-green-400' : 'text-red-400'}`}>
                {mode === 'deposit' ? '+' : '-'}{formatCurrency(numAmount)}
              </span>
            </div>
            {mode === 'deposit' && broker && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Corretora</span>
                <span>{broker}</span>
              </div>
            )}
            <div className="border-t border-border pt-1 flex justify-between font-medium">
              <span>Novo saldo</span>
              <span className="font-mono text-primary">{formatCurrency(newBalance)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || saving}>
            {saving ? 'Salvando...' : mode === 'deposit' ? 'Depositar' : 'Sacar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
