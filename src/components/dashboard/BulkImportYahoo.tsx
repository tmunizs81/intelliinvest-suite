import { useState } from 'react';
import { X, Loader2, Sparkles, CheckCircle2, AlertCircle, Trash2, RefreshCw, Pencil, Landmark } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { classifyAssetType } from '@/lib/assetClassification';
import { AVENUE_ASSETS } from '@/lib/avenueAssets';
import { XTB_ASSETS } from '@/lib/xtbAssets';
import { WEBULL_ASSETS } from '@/lib/webullAssets';
import { C6_ASSETS } from '@/lib/c6Assets';
import { BTG_ASSETS } from '@/lib/btgAssets';
import { inferBrokerFromTicker } from '@/lib/brokerCatalogs';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ParsedLine {
  ticker: string;
  quantity: number;
  price: number | null;
}

interface Resolved {
  id: string;
  ticker: string;
  quantity: number;
  price: number | null;
  name: string;
  type: string;
  currency: string;
  currentPrice: number;
  broker: string;
  status: 'ok' | 'not_found' | 'error' | 'skipped';
  error?: string;
  include: boolean;
}

const EXAMPLE = `# Exemplos B3
PETR4 100 32.50
BOVA11 30 105
# Exemplos Avenue (ações US + ETFs irlandeses UCITS)
AAPL 10 190
VOO 5 480
CSPX.L 8 550
VWRA.L 12 120`;

const ASSET_TYPES = ['Ação', 'FII', 'ETF', 'Cripto', 'Renda Fixa', 'Fundo', 'BDR', 'Ação Internacional', 'ETF Internacional', 'REIT'];

function parseInput(raw: string): ParsedLine[] {
  return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[\s,;\t]+/).filter(Boolean);
    const [ticker, qty, price] = parts;
    return {
      ticker: (ticker || '').toUpperCase(),
      quantity: parseFloat((qty || '0').replace(',', '.')),
      price: price ? parseFloat(price.replace(',', '.')) : null,
    };
  }).filter((p) => p.ticker && p.quantity > 0);
}

export default function BulkImportYahoo({ open, onClose }: Props) {
  const { addHolding } = usePortfolio();
  const [text, setText] = useState('');
  const [step, setStep] = useState<'input' | 'preview' | 'importing' | 'done'>('input');
  const [resolved, setResolved] = useState<Resolved[]>([]);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const reset = () => {
    setText(''); setStep('input'); setResolved([]); setProgress(0); setErr(''); setLoading(false);
  };
  const doClose = () => { reset(); onClose(); };

  const enrich = async (parsed: ParsedLine[]): Promise<Resolved[]> => {
    const tickers = parsed.map((p) => p.ticker);
    const { data, error } = await supabase.functions.invoke('yahoo-finance', { body: { tickers } });
    if (error) throw error;
    const quotes = (data as any)?.quotes || {};
    return parsed.map((p, i) => {
      const q = quotes[p.ticker];
      if (!q || !q.currentPrice) {
        return {
          id: `${p.ticker}-${i}`, ...p, name: p.ticker, type: 'Ação', currency: 'BRL',
          currentPrice: 0, broker: '', status: 'not_found', error: 'Não encontrado no Yahoo', include: false,
        };
      }
      return {
        id: `${p.ticker}-${i}`, ...p,
        name: q.name || p.ticker,
        type: classifyAssetType(p.ticker, 'Ação'),
        currency: q.currency || 'BRL',
        currentPrice: q.currentPriceBRL || q.currentPrice,
        broker: inferBrokerFromTicker(p.ticker) || '',
        status: 'ok', include: true,
      };
    });
  };

  const lookup = async () => {
    setErr('');
    const parsed = parseInput(text);
    if (parsed.length === 0) { setErr('Nenhuma linha válida. Use: TICKER QTD [PREÇO]'); return; }
    setLoading(true);
    setStep('preview');
    try {
      const enriched = await enrich(parsed);
      setResolved(enriched);
    } catch (e: any) {
      setErr(e?.message || 'Erro ao consultar Yahoo Finance');
      setStep('input');
    } finally { setLoading(false); }
  };

  const requery = async (id: string) => {
    const row = resolved.find((r) => r.id === id);
    if (!row) return;
    setResolved((rs) => rs.map((r) => r.id === id ? { ...r, status: 'ok', error: undefined } : r));
    try {
      const [fresh] = await enrich([{ ticker: row.ticker, quantity: row.quantity, price: row.price }]);
      setResolved((rs) => rs.map((r) => r.id === id ? { ...fresh, id, broker: row.broker } : r));
    } catch {
      setResolved((rs) => rs.map((r) => r.id === id ? { ...r, status: 'error', error: 'Falha ao consultar' } : r));
    }
  };

  const updateRow = (id: string, patch: Partial<Resolved>) => {
    setResolved((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRow = (id: string) => setResolved((rs) => rs.filter((r) => r.id !== id));

  const validRows = resolved.filter((r) => r.include && r.status === 'ok' && r.quantity > 0 && r.ticker);
  const invalidCount = resolved.filter((r) => r.status !== 'ok').length;

  const confirm = async () => {
    if (validRows.length === 0) return;
    setStep('importing'); setProgress(0);
    const rows = validRows.map((r) => ({
      ticker: r.ticker,
      name: r.name,
      type: r.type,
      operation: 'COMPRA',
      quantity: r.quantity,
      price: r.price ?? r.currentPrice,
      fees: 0,
      broker: r.broker || null,
      sector: null,
    }));
    try {
      const { error } = await (supabase as any).rpc('import_transactions_atomic', { _rows: rows });
      if (error) throw error;
      setProgress(validRows.length);
      setStep('done');
    } catch (e: any) {
      setErr(`Import atômica revertida: ${e?.message || 'erro desconhecido'}. Nenhum ativo foi alterado.`);
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card shadow-xl animate-fade-in max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Importar via Yahoo Finance</h2>
          </div>
          <button onClick={doClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {step === 'input' && (
            <div className="space-y-4">
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
                Cole uma linha por ativo: <code className="font-mono text-foreground">TICKER QUANTIDADE [PREÇO]</code>.
                Se omitir o preço, usamos a cotação atual. ETFs irlandeses UCITS use sufixo <code className="font-mono text-foreground">.L</code> (ex: <code className="font-mono text-foreground">CSPX.L</code>, <code className="font-mono text-foreground">VUAA.L</code>).
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    const lines = AVENUE_ASSETS.map((a) => `${a.ticker} 1`).join('\n');
                    setText((prev) => (prev.trim() ? prev.trim() + '\n' : '') + lines);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                  title={`${AVENUE_ASSETS.length} ativos Avenue (ações US, ETFs, ADRs, UCITS irlandeses)`}
                >
                  <Landmark className="h-3 w-3" />
                  Avenue completo ({AVENUE_ASSETS.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const lines = AVENUE_ASSETS.filter((a) => a.category === 'ucits').map((a) => `${a.ticker} 1`).join('\n');
                    setText((prev) => (prev.trim() ? prev.trim() + '\n' : '') + lines);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
                >
                  Só ETFs irlandeses UCITS
                </button>
                <button
                  type="button"
                  onClick={() => setText('')}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-loss"
                >
                  Limpar
                </button>
              </div>

              {err && <div className="rounded-md bg-loss/10 border border-loss/20 p-3 text-sm text-loss">{err}</div>}
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
                Consultar e revisar
              </button>
            </div>
          )}

          {step === 'preview' && (
            loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gain font-medium">✓ {validRows.length} prontos para importar</span>
                    {invalidCount > 0 && <span className="text-loss">✗ {invalidCount} com erro</span>}
                    <span className="text-muted-foreground">Total: {resolved.length}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setResolved((rs) => rs.map((r) => ({ ...r, include: r.status === 'ok' })))}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Marcar todos válidos
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      onClick={() => setResolved((rs) => rs.filter((r) => r.status === 'ok'))}
                      className="text-[11px] text-loss hover:underline"
                    >
                      Descartar inválidos
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-border overflow-hidden">
                  <div className="grid grid-cols-[24px,90px,1fr,90px,110px,90px,90px,60px] gap-2 items-center px-3 py-2 bg-muted/40 text-[10px] font-semibold uppercase text-muted-foreground">
                    <span></span>
                    <span>Ticker</span>
                    <span>Nome</span>
                    <span>Qtd</span>
                    <span>Preço médio</span>
                    <span>Tipo</span>
                    <span>Corretora</span>
                    <span></span>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
                    {resolved.map((r) => {
                      const ok = r.status === 'ok';
                      return (
                        <div key={r.id} className={`grid grid-cols-[24px,90px,1fr,90px,110px,90px,90px,60px] gap-2 items-center px-3 py-2 text-xs ${ok ? '' : 'bg-loss/5'}`}>
                          <input
                            type="checkbox"
                            checked={r.include}
                            disabled={!ok}
                            onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                            className="h-3.5 w-3.5 accent-primary disabled:opacity-40"
                          />
                          <input
                            value={r.ticker}
                            onChange={(e) => updateRow(r.id, { ticker: e.target.value.toUpperCase() })}
                            className="rounded border border-input bg-background px-1.5 py-1 font-mono text-xs"
                          />
                          <div className="min-w-0">
                            <input
                              value={r.name}
                              onChange={(e) => updateRow(r.id, { name: e.target.value })}
                              className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs truncate"
                              title={r.name}
                            />
                            {!ok && <p className="text-[10px] text-loss mt-0.5 truncate">{r.error}</p>}
                            {ok && r.currentPrice > 0 && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                atual: {r.currentPrice.toFixed(2)} {r.currency}
                              </p>
                            )}
                          </div>
                          <input
                            type="number"
                            step="any"
                            value={r.quantity}
                            onChange={(e) => updateRow(r.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="rounded border border-input bg-background px-1.5 py-1 font-mono text-xs text-right"
                          />
                          <input
                            type="number"
                            step="any"
                            value={r.price ?? r.currentPrice}
                            onChange={(e) => updateRow(r.id, { price: parseFloat(e.target.value) || 0 })}
                            className="rounded border border-input bg-background px-1.5 py-1 font-mono text-xs text-right"
                          />
                          <select
                            value={r.type}
                            onChange={(e) => updateRow(r.id, { type: e.target.value })}
                            className="rounded border border-input bg-background px-1 py-1 text-xs"
                          >
                            {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input
                            value={r.broker}
                            onChange={(e) => updateRow(r.id, { broker: e.target.value })}
                            placeholder="—"
                            className="rounded border border-input bg-background px-1.5 py-1 text-xs"
                          />
                          <div className="flex items-center justify-end gap-0.5">
                            {!ok && (
                              <button onClick={() => requery(r.id)} className="p-1 text-muted-foreground hover:text-primary" title="Tentar novamente">
                                <RefreshCw className="h-3 w-3" />
                              </button>
                            )}
                            <button onClick={() => removeRow(r.id)} className="p-1 text-muted-foreground hover:text-loss" title="Remover">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setStep('input')} className="flex-1 rounded-md border border-border py-2 text-sm hover:bg-accent/50">
                    Voltar e editar
                  </button>
                  <button
                    onClick={confirm}
                    disabled={validRows.length === 0}
                    className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Confirmar e importar {validRows.length} ativo{validRows.length === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
            )
          )}

          {step === 'importing' && (
            <div className="py-8 space-y-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm">Importando {progress} de {validRows.length}...</p>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(progress / Math.max(1, validRows.length)) * 100}%` }} />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-gain mx-auto" />
              <p className="text-lg font-semibold">Importação concluída</p>
              <p className="text-sm text-muted-foreground">{progress} ativos adicionados à sua carteira</p>
              <button onClick={doClose} className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
