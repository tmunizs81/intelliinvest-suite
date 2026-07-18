import { useState } from 'react';
import { X, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { classifyAssetType } from '@/lib/assetClassification';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ParsedLine {
  ticker: string;
  quantity: number;
  price: number | null; // null → use current
}

interface Resolved extends ParsedLine {
  name: string;
  type: string;
  currency: string;
  currentPrice: number;
  status: 'ok' | 'not_found' | 'error';
  error?: string;
}

const EXAMPLE = `PETR4 100 32.50
VALE3 50
BOVA11 30 105
BTC-USD 0.05`;

function parseInput(raw: string): ParsedLine[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\s,;\t]+/).filter(Boolean);
      const [ticker, qty, price] = parts;
      return {
        ticker: (ticker || '').toUpperCase(),
        quantity: parseFloat((qty || '0').replace(',', '.')),
        price: price ? parseFloat(price.replace(',', '.')) : null,
      };
    })
    .filter((p) => p.ticker && p.quantity > 0);
}

export default function BulkImportYahoo({ open, onClose }: Props) {
  const { addHolding } = usePortfolio();
  const [text, setText] = useState('');
  const [step, setStep] = useState<'input' | 'preview' | 'importing' | 'done'>('input');
  const [resolved, setResolved] = useState<Resolved[]>([]);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');

  if (!open) return null;

  const reset = () => {
    setText(''); setStep('input'); setResolved([]); setProgress(0); setErr('');
  };

  const doClose = () => { reset(); onClose(); };

  const lookup = async () => {
    setErr('');
    const parsed = parseInput(text);
    if (parsed.length === 0) {
      setErr('Nenhuma linha válida. Use: TICKER QTD [PREÇO]');
      return;
    }
    setStep('preview');
    try {
      const tickers = parsed.map((p) => p.ticker);
      const { data, error } = await supabase.functions.invoke('yahoo-finance', {
        body: { tickers },
      });
      if (error) throw error;
      const quotes = (data as any)?.quotes || {};
      const enriched: Resolved[] = parsed.map((p) => {
        const q = quotes[p.ticker];
        if (!q || !q.currentPrice) {
          return {
            ...p,
            name: p.ticker,
            type: 'Ação',
            currency: 'BRL',
            currentPrice: 0,
            status: 'not_found',
            error: 'Não encontrado no Yahoo',
          };
        }
        return {
          ...p,
          name: q.name || p.ticker,
          type: classifyAssetType(p.ticker, 'Ação'),
          currency: q.currency || 'BRL',
          currentPrice: q.currentPriceBRL || q.currentPrice,
          status: 'ok',
        };
      });
      setResolved(enriched);
    } catch (e: any) {
      setErr(e?.message || 'Erro ao consultar Yahoo Finance');
      setStep('input');
    }
  };

  const confirm = async () => {
    const valid = resolved.filter((r) => r.status === 'ok');
    if (valid.length === 0) return;
    setStep('importing');
    setProgress(0);
    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      try {
        await addHolding({
          ticker: r.ticker,
          name: r.name,
          type: r.type,
          quantity: r.quantity,
          avg_price: r.price ?? r.currentPrice,
          sector: null,
          broker: null,
        });
      } catch (e) {
        console.error('add failed', r.ticker, e);
      }
      setProgress(i + 1);
    }
    setStep('done');
  };

  const okCount = resolved.filter((r) => r.status === 'ok').length;
  const failCount = resolved.length - okCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card shadow-xl animate-fade-in max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Importar via Yahoo Finance</h2>
          </div>
          <button onClick={doClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === 'input' && (
            <div className="space-y-4">
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
                Cole uma linha por ativo: <code className="font-mono text-foreground">TICKER QUANTIDADE [PREÇO]</code>.
                Se omitir o preço, usamos a cotação atual do Yahoo. Nome, moeda e tipo são detectados automaticamente.
              </div>
              {err && (
                <div className="rounded-md bg-loss/10 border border-loss/20 p-3 text-sm text-loss-foreground">{err}</div>
              )}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={EXAMPLE}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={lookup}
                disabled={!text.trim()}
                className="w-full rounded-md bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Consultar Yahoo Finance
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              {resolved.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gain">✓ {okCount} prontos</span>
                    {failCount > 0 && <span className="text-loss">✗ {failCount} com erro</span>}
                  </div>
                  <div className="rounded-md border border-border divide-y divide-border max-h-[400px] overflow-y-auto">
                    {resolved.map((r, i) => (
                      <div key={i} className="p-3 flex items-center gap-3">
                        {r.status === 'ok' ? (
                          <CheckCircle2 className="h-4 w-4 text-gain shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-loss shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-sm">{r.ticker}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{r.type}</span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{r.name}</p>
                        </div>
                        <div className="text-right text-xs">
                          <div className="font-mono">{r.quantity} × {(r.price ?? r.currentPrice).toFixed(2)} {r.currency}</div>
                          {r.status !== 'ok' && <div className="text-loss">{r.error}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('input')}
                      className="flex-1 rounded-md border border-border py-2 text-sm hover:bg-accent/50"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={confirm}
                      disabled={okCount === 0}
                      className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      Importar {okCount} ativos
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'importing' && (
            <div className="py-8 space-y-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm">Importando {progress} de {okCount}...</p>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(progress / Math.max(1, okCount)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-gain mx-auto" />
              <p className="text-lg font-semibold">Importação concluída</p>
              <p className="text-sm text-muted-foreground">{okCount} ativos adicionados à sua carteira</p>
              <button
                onClick={doClose}
                className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
