import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AlertTriangle, Check, Copy, X } from 'lucide-react';
import { formatCurrency } from '@/lib/mockData';

interface Operation {
  ticker: string;
  name: string;
  operation: string;
  quantity: number;
  price: number;
  total: number;
  date: string;
}

interface Props {
  operations: Operation[];
  onValidated: (validOps: Operation[], duplicates: number[]) => void;
}

export default function ImportValidationPreview({ operations, onValidated }: Props) {
  const { user } = useAuth();
  const [duplicates, setDuplicates] = useState<Set<number>>(new Set());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user || operations.length === 0) {
      setChecking(false);
      return;
    }

    const checkDuplicates = async () => {
      const dupes = new Set<number>();

      // Fetch existing transactions for this user
      const tickers = [...new Set(operations.map(o => o.ticker.toUpperCase()))];
      const { data: existing } = await supabase
        .from('transactions')
        .select('ticker, quantity, price, date, operation')
        .eq('user_id', user.id)
        .in('ticker', tickers);

      if (existing) {
        operations.forEach((op, idx) => {
          const match = existing.find(
            e =>
              e.ticker === op.ticker.toUpperCase() &&
              Number(e.quantity) === op.quantity &&
              Math.abs(Number(e.price) - op.price) < 0.01 &&
              e.date === op.date &&
              e.operation === op.operation
          );
          if (match) dupes.add(idx);
        });
      }

      setDuplicates(dupes);
      setChecking(false);

      const validOps = operations.filter((_, i) => !dupes.has(i));
      onValidated(validOps, Array.from(dupes));
    };

    checkDuplicates();
  }, [user, operations]);

  if (checking) return null;
  if (duplicates.size === 0) return null;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 space-y-2 animate-fade-in">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
        <p className="text-xs font-medium text-warning">
          {duplicates.size} operação(ões) duplicada(s) detectada(s)
        </p>
      </div>
      <div className="space-y-1">
        {Array.from(duplicates).map(idx => {
          const op = operations[idx];
          return (
            <div key={idx} className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1">
              <Copy className="h-3 w-3 text-warning shrink-0" />
              <span className="font-mono font-bold">{op.ticker}</span>
              <span>{op.operation === 'buy' ? 'Compra' : 'Venda'}</span>
              <span>{op.quantity}un × {formatCurrency(op.price)}</span>
              <span>{op.date}</span>
              <span className="ml-auto text-warning font-medium">DUPLICADA</span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">
        As duplicatas serão automaticamente excluídas da importação.
      </p>
    </div>
  );
}
