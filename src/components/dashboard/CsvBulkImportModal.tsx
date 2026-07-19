import { useMemo, useState } from 'react';
import { X, Upload, Loader2, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/hooks/usePortfolio';
import { classifyAssetType } from '@/lib/assetClassification';
import { BROKER_CATALOGS, inferBrokerFromTicker } from '@/lib/brokerCatalogs';
import { getRule, learnRule } from '@/lib/tickerMappingRules';

interface Props { open: boolean; onClose: () => void }

interface ParsedRow {
  raw: Record<string, string>;
  ticker: string;
  quantity: number;
  price: number;
  broker: string;
  type: string;
  duplicate: boolean;
  valid: boolean;
  errors: string[];
  include: boolean;
}

const REQUIRED = ['ticker', 'quantity', 'price'] as const;
const FIELDS = ['ticker', 'quantity', 'price', 'broker', 'type'] as const;
type FieldKey = typeof FIELDS[number];

function splitCsv(text: string): string[][] {
  // Simple CSV parser supporting , or ; with quoted strings.
  const rows: string[][] = [];
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim().length);
  const sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
  for (const line of lines) {
    const out: string[] = [];
    let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { q = !q; continue; }
      if (ch === sep && !q) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    rows.push(out);
  }
  return rows;
}

function num(s: string): number {
  if (!s) return NaN;
  const norm = s.replace(/\./g, '').replace(',', '.');
  const n1 = parseFloat(s);
  const n2 = parseFloat(norm);
  return isFinite(n1) ? n1 : n2;
}

export default function CsvBulkImportModal({ open, onClose }: Props) {
  const { holdings } = usePortfolio();
  const [step, setStep] = useState<'input' | 'map' | 'preview' | 'importing' | 'done'>('input');
  const [text, setText] = useState('');
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, number>>({ ticker: -1, quantity: -1, price: -1, broker: -1, type: -1 });
  const [manualBroker, setManualBroker] = useState<string>('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [err, setErr] = useState('');
  const [progress, setProgress] = useState(0);

  if (!open) return null;

  const existingKey = useMemo(() => {
    const s = new Set<string>();
    for (const h of holdings) s.add(`${h.ticker.toUpperCase()}::${(h.broker || '').toUpperCase()}`);
    return s;
  }, [holdings]);

  const reset = () => {
    setStep('input'); setText(''); setTable([]); setRows([]); setErr(''); setProgress(0); setManualBroker('');
    setMapping({ ticker: -1, quantity: -1, price: -1, broker: -1, type: -1 });
  };
  const doClose = () => { reset(); onClose(); };

  const onFile = async (f: File) => {
    const t = await f.text();
    setText(t);
    parseAndGoMap(t);
  };

  const parseAndGoMap = (t: string) => {
    setErr('');
    const tbl = splitCsv(t);
    if (tbl.length < 2) { setErr('CSV vazio ou sem linhas de dados.'); return; }
    setTable(tbl);
    // heurística: header row
    const header = tbl[0].map((h) => h.toLowerCase());
    const guess = (names: string[]): number => {
      for (const n of names) {
        const i = header.findIndex((h) => h === n || h.includes(n));
        if (i >= 0) return i;
      }
      return -1;
    };
    setMapping({
      ticker: guess(['ticker', 'symbol', 'código', 'codigo', 'papel']),
      quantity: guess(['qtd', 'quant', 'quantity', 'quantidade']),
      price: guess(['preço', 'preco', 'price', 'valor', 'cotação', 'cotacao']),
      broker: guess(['broker', 'corretora']),
      type: guess(['type', 'tipo']),
    });
    setStep('map');
  };

  const buildRows = () => {
    setErr('');
    for (const f of REQUIRED) {
      if (mapping[f] < 0) { setErr(`Mapeie a coluna obrigatória: ${f}`); return; }
    }
    const body = table.slice(1);
    const seenInFile = new Set<string>();
    const parsed: ParsedRow[] = body.map((r) => {
      const raw: Record<string, string> = {};
      FIELDS.forEach((k) => { raw[k] = mapping[k] >= 0 ? (r[mapping[k]] || '') : ''; });
      const ticker = (raw.ticker || '').toUpperCase().trim();
      const quantity = num(raw.quantity);
      const price = num(raw.price);
      const rule = getRule(ticker);
      const broker = (raw.broker || manualBroker || rule?.broker || inferBrokerFromTicker(ticker) || '').trim();
      const type = raw.type || rule?.type || classifyAssetType(ticker) || 'Ação';
      const errors: string[] = [];
      if (!ticker) errors.push('ticker vazio');
      if (!(quantity > 0)) errors.push('quantidade inválida');
      if (!(price >= 0)) errors.push('preço inválido');
      const key = `${ticker}::${broker.toUpperCase()}`;
      const duplicateInFile = seenInFile.has(key);
      if (duplicateInFile) errors.push('duplicado no arquivo');
      seenInFile.add(key);
      const duplicate = existingKey.has(key) || duplicateInFile;
      return {
        raw, ticker, quantity, price, broker, type,
        duplicate, valid: errors.length === 0, errors, include: errors.length === 0 && !existingKey.has(key),
      };
    });
    setRows(parsed);
    setStep('preview');
  };

  const validRows = rows.filter((r) => r.include && r.valid);

  const confirm = async () => {
    if (!validRows.length) return;
    setStep('importing'); setProgress(0);
    const payload = validRows.map((r) => ({
      ticker: r.ticker,
      name: r.ticker,
      type: r.type,
      operation: 'COMPRA',
      quantity: r.quantity,
      price: r.price,
      fees: 0,
      broker: r.broker || null,
      sector: null,
    }));
    try {
      const { error } = await (supabase as any).rpc('import_transactions_atomic', { _rows: payload });
      if (error) throw error;
      // aprende regras
      for (const r of validRows) if (r.broker) learnRule(r.ticker, { broker: r.broker, type: r.type });
      setProgress(validRows.length);
      setStep('done');
    } catch (e: any) {
      setErr(`Import atômica revertida: ${e?.message || 'erro'}. Nenhum ativo foi alterado.`);
      setStep('preview');
    }
  };

  const dupCount = rows.filter((r) => r.duplicate).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card shadow-xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Importar CSV</h2>
          </div>
          <button onClick={doClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {err && <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{err}</div>}

          {step === 'input' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Envie um CSV com colunas de ticker, quantidade, preço e opcionalmente corretora/tipo.
                Suporta separador vírgula ou ponto-e-vírgula.
              </p>
              <input type="file" accept=".csv,text/csv,text/plain"
                onChange={(e) => e.target.files && onFile(e.target.files[0])}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:opacity-90"
              />
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">…ou cole o conteúdo aqui</summary>
                <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
                <button onClick={() => parseAndGoMap(text)} disabled={!text.trim()}
                  className="mt-2 rounded-md bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">
                  Analisar
                </button>
              </details>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-3">
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-xs">
                Detectamos <b>{table.length - 1}</b> linhas. Confirme o mapeamento das colunas.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((f) => (
                  <div key={f} className="space-y-1">
                    <label className="text-[11px] text-muted-foreground uppercase">
                      {f} {(REQUIRED as readonly string[]).includes(f) && <span className="text-destructive">*</span>}
                    </label>
                    <select value={mapping[f]}
                      onChange={(e) => setMapping((m) => ({ ...m, [f]: parseInt(e.target.value) }))}
                      className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs">
                      <option value={-1}>— não mapear —</option>
                      {table[0].map((h, i) => (
                        <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground uppercase">Corretora manual (fallback)</label>
                <select value={manualBroker} onChange={(e) => setManualBroker(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs">
                  <option value="">Inferir automaticamente (regra/catálogo)</option>
                  {BROKER_CATALOGS.map((c) => <option key={c.broker} value={c.broker}>{c.broker}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('input')} className="flex-1 rounded-md border border-border py-2 text-sm">Voltar</button>
                <button onClick={buildRows} className="flex-1 rounded-md bg-primary py-2 text-sm text-primary-foreground">Validar linhas</button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gain">✓ {validRows.length} prontos</span>
                {dupCount > 0 && <span className="text-amber-500 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {dupCount} duplicados</span>}
                {invalidCount > 0 && <span className="text-destructive">✗ {invalidCount} inválidos</span>}
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="grid grid-cols-[24px,90px,80px,90px,90px,110px,1fr,32px] gap-2 px-3 py-2 bg-muted/40 text-[10px] font-semibold uppercase text-muted-foreground">
                  <span></span><span>Ticker</span><span>Qtd</span><span>Preço</span><span>Tipo</span><span>Corretora</span><span>Status</span><span></span>
                </div>
                <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
                  {rows.map((r, i) => (
                    <div key={i} className={`grid grid-cols-[24px,90px,80px,90px,90px,110px,1fr,32px] gap-2 px-3 py-2 items-center text-xs ${!r.valid ? 'bg-destructive/5' : r.duplicate ? 'bg-amber-500/5' : ''}`}>
                      <input type="checkbox" checked={r.include} disabled={!r.valid}
                        onChange={(e) => setRows((rs) => rs.map((x, j) => j === i ? { ...x, include: e.target.checked } : x))}
                        className="h-3.5 w-3.5 accent-primary disabled:opacity-40" />
                      <span className="font-mono">{r.ticker || '—'}</span>
                      <span className="font-mono text-right">{isFinite(r.quantity) ? r.quantity : '—'}</span>
                      <span className="font-mono text-right">{isFinite(r.price) ? r.price.toFixed(2) : '—'}</span>
                      <span>{r.type}</span>
                      <span className="truncate" title={r.broker}>{r.broker || '—'}</span>
                      <span className={r.valid ? (r.duplicate ? 'text-amber-500' : 'text-gain') : 'text-destructive'}>
                        {r.valid ? (r.duplicate ? 'já existe na carteira' : 'ok') : r.errors.join(', ')}
                      </span>
                      <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep('map')} className="flex-1 rounded-md border border-border py-2 text-sm">Voltar</button>
                <button onClick={confirm} disabled={!validRows.length}
                  className="flex-1 rounded-md bg-primary py-2 text-sm text-primary-foreground disabled:opacity-50">
                  Confirmar e importar {validRows.length}
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="py-10 text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Importando {progress}/{validRows.length}…</p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-10 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-gain mx-auto" />
              <p className="text-sm">Importação concluída com sucesso.</p>
              <button onClick={doClose} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Fechar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
