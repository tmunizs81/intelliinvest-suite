import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Upload, Loader2, Check, FileText, AlertTriangle, Plus } from 'lucide-react';
import { formatCurrency } from '@/lib/mockData';
import { toast } from 'sonner';

interface ParsedOperation {
  ticker: string;
  name: string;
  type: string;
  operation: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  fees: number;
  date: string;
  is_daytrade: boolean;
}

interface ParseResult {
  broker: string;
  operations: ParsedOperation[];
  summary: string;
}

export default function B3ImportPanel({ onImportComplete }: { onImportComplete?: () => void }) {
  const { user } = useAuth();
  const { log: auditLog } = useAuditLog();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const text = await file.text();
      const { data, error: fnError } = await supabase.functions.invoke('parse-b3-extract', {
        body: { csvContent: text },
      });
      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);
      setResult(data);
      setSelected(new Set(data.operations.map((_: any, i: number) => i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  }, []);

  const importSelected = useCallback(async () => {
    if (!user || !result || selected.size === 0) return;
    setImporting(true);
    try {
      let imported = 0;
      for (const idx of selected) {
        const op = result.operations[idx];
        if (!op) continue;

        // Insert transaction
        await supabase.from('transactions').insert({
          user_id: user.id,
          ticker: op.ticker.toUpperCase(),
          name: op.name,
          type: op.type,
          operation: op.operation,
          quantity: op.quantity,
          price: op.price,
          total: op.total,
          fees: op.fees,
          date: op.date,
          is_daytrade: op.is_daytrade,
          notes: `Importação B3 - ${result.broker}`,
        });

        // If buy, update or create holding
        if (op.operation === 'buy') {
          const { data: existing } = await supabase
            .from('holdings')
            .select('id, quantity, avg_price')
            .eq('user_id', user.id)
            .eq('ticker', op.ticker.toUpperCase())
            .maybeSingle();

          if (existing) {
            const newQty = Number(existing.quantity) + op.quantity;
            const newAvg = ((Number(existing.avg_price) * Number(existing.quantity)) + (op.price * op.quantity)) / newQty;
            await supabase.from('holdings').update({
              quantity: newQty,
              avg_price: newAvg,
            } as any).eq('id', existing.id);
          } else {
            await supabase.from('holdings').insert({
              user_id: user.id,
              ticker: op.ticker.toUpperCase(),
              name: op.name,
              type: op.type,
              quantity: op.quantity,
              avg_price: op.price,
              broker: result.broker || null,
            } as any);
          }
        }

        imported++;
      }

      await auditLog('add', 'b3-import', undefined, {
        broker: result.broker,
        operations: imported,
      });

      toast.success(`${imported} operação(ões) importada(s) com sucesso!`);
      setResult(null);
      onImportComplete?.();
    } catch (err) {
      toast.error('Erro ao importar operações');
    } finally {
      setImporting(false);
    }
  }, [user, result, selected, auditLog, onImportComplete]);

  const toggleSelect = (idx: number) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-6 text-center">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xls,.xlsx"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <Upload className="h-8 w-8 text-primary mx-auto mb-2" />
        <p className="text-sm font-medium mb-1">Importar Extrato B3/CEI</p>
        <p className="text-xs text-muted-foreground mb-3">
          Arraste ou selecione seu extrato CSV/TXT do CEI ou nota de corretagem
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Selecionar Arquivo
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-loss/20 bg-loss/5 text-sm text-loss">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Corretora: {result.broker || 'Não identificada'}</p>
              <p className="text-xs text-muted-foreground">{result.summary}</p>
            </div>
            <p className="text-xs text-muted-foreground">{selected.size}/{result.operations.length} selecionadas</p>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-1.5">
            {result.operations.map((op, i) => (
              <label key={i} className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all ${
                selected.has(i) ? 'bg-primary/5 border border-primary/20' : 'bg-muted/30 border border-transparent'
              }`}>
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => toggleSelect(i)}
                  className="rounded border-border"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      op.operation === 'buy' ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'
                    }`}>
                      {op.operation === 'buy' ? 'Compra' : 'Venda'}
                    </span>
                    <span className="font-mono font-bold">{op.ticker}</span>
                    <span className="text-muted-foreground truncate">{op.name}</span>
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground mt-0.5">
                    <span>{op.quantity}un × {formatCurrency(op.price)}</span>
                    <span>Total: {formatCurrency(op.total)}</span>
                    <span>{op.date}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={importSelected}
            disabled={importing || selected.size === 0}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Importar {selected.size} operação(ões)
          </button>
        </div>
      )}
    </div>
  );
}
