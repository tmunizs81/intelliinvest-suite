import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolio } from '@/hooks/usePortfolio';
import { formatCurrency } from '@/lib/mockData';
import {
  FileUp, Loader2, CheckCircle, AlertTriangle, X, Upload,
  ArrowUp, ArrowDown, FileText, Sparkles,
} from 'lucide-react';

interface Trade {
  ticker: string;
  name: string;
  type: string;
  operation: 'buy' | 'sell';
  quantity: number;
  price: number;
  total: number;
  fees?: number;
}

interface ParseResult {
  broker: string;
  date: string;
  trades: Trade[];
  total_fees: number;
  total_bought: number;
  total_sold: number;
  net_total: number;
  confidence: number;
  notes?: string;
}

export default function BrokerageImportPanel() {
  const { user } = useAuth();
  const { refresh } = usePortfolio();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [textInput, setTextInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseNote = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setImported(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('parse-brokerage-note', {
        body: { text_content: text },
      });
      if (fnError) throw new Error(fnError.message);
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar nota');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setTextInput(text);
        parseNote(text);
      }
    };
    reader.readAsText(file);
  };

  const importTrades = useCallback(async () => {
    if (!result || !user) return;
    setImporting(true);
    try {
      for (const trade of result.trades) {
        if (trade.operation === 'buy') {
          // Check if holding exists
          const { data: existing } = await supabase
            .from('holdings')
            .select('id, quantity, avg_price')
            .eq('user_id', user.id)
            .eq('ticker', trade.ticker)
            .maybeSingle();

          if (existing) {
            // Update existing holding with weighted average
            const totalQty = existing.quantity + trade.quantity;
            const newAvgPrice = ((existing.avg_price * existing.quantity) + (trade.price * trade.quantity)) / totalQty;
            await supabase.from('holdings').update({
              quantity: totalQty,
              avg_price: newAvgPrice,
            }).eq('id', existing.id);
          } else {
            // Create new holding
            await supabase.from('holdings').insert({
              user_id: user.id,
              ticker: trade.ticker,
              name: trade.name,
              type: trade.type,
              quantity: trade.quantity,
              avg_price: trade.price,
              sector: null,
            });
          }
        }

        // Record transaction
        await supabase.from('transactions').insert({
          user_id: user.id,
          ticker: trade.ticker,
          name: trade.name,
          type: trade.type,
          operation: trade.operation,
          quantity: trade.quantity,
          price: trade.price,
          total: trade.total,
          fees: trade.fees || 0,
          date: result.date,
          is_daytrade: false,
          notes: `Importado da nota ${result.broker} - ${result.date}`,
        });
      }

      setImported(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar');
    } finally {
      setImporting(false);
    }
  }, [result, user, refresh]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-warning/10 flex items-center justify-center">
          <FileUp className="h-3.5 w-3.5 text-warning" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Importar Nota de Corretagem</h3>
          <p className="text-[10px] text-muted-foreground">Extração automática via IA (B3)</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!result && !loading && (
          <>
            {/* Upload area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium">Arraste ou clique para enviar</p>
              <p className="text-[11px] text-muted-foreground mt-1">Nota de corretagem em .txt ou .csv</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <div className="text-center text-[11px] text-muted-foreground">ou cole o conteúdo abaixo</div>

            {/* Text input */}
            <textarea
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              placeholder="Cole o conteúdo da nota de corretagem aqui..."
              className="w-full h-32 bg-muted rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/50 resize-none placeholder:text-muted-foreground"
            />

            <button
              onClick={() => parseNote(textInput)}
              disabled={!textInput.trim()}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
            >
              <Sparkles className="h-4 w-4" />
              Extrair com IA
            </button>
          </>
        )}

        {loading && (
          <div className="flex flex-col items-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Extraindo dados com IA...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-loss/30 bg-loss/5 p-3">
            <p className="text-xs text-loss">⚠️ {error}</p>
            <button onClick={() => { setError(null); setResult(null); }}
              className="text-xs text-primary hover:underline mt-2">Tentar novamente</button>
          </div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <div>
                <p className="text-xs font-semibold">{result.broker}</p>
                <p className="text-[10px] text-muted-foreground">{result.date}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  result.confidence >= 80 ? 'bg-gain/10 text-gain' :
                  result.confidence >= 50 ? 'bg-warning/10 text-warning' : 'bg-loss/10 text-loss'
                }`}>
                  {result.confidence}% confiança
                </span>
                <button onClick={() => { setResult(null); setTextInput(''); }}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {result.notes && (
              <div className="rounded-lg bg-warning/5 border border-warning/20 p-2">
                <p className="text-[10px] text-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {result.notes}
                </p>
              </div>
            )}

            {/* Trades table */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                {result.trades.length} operações encontradas
              </p>
              {result.trades.map((trade, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-[11px]">
                  {trade.operation === 'buy' ? (
                    <ArrowUp className="h-3.5 w-3.5 text-gain shrink-0" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5 text-loss shrink-0" />
                  )}
                  <span className="font-mono font-bold w-16">{trade.ticker}</span>
                  <span className="text-muted-foreground truncate flex-1">{trade.name}</span>
                  <span className="font-mono w-8 text-right">{trade.quantity}</span>
                  <span className="font-mono w-20 text-right">{formatCurrency(trade.price)}</span>
                  <span className="font-mono w-24 text-right font-semibold">{formatCurrency(trade.total)}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-gain/5">
                <p className="text-[9px] text-muted-foreground">Compras</p>
                <p className="text-xs font-mono font-bold text-gain">{formatCurrency(result.total_bought)}</p>
              </div>
              <div className="p-2 rounded-lg bg-loss/5">
                <p className="text-[9px] text-muted-foreground">Vendas</p>
                <p className="text-xs font-mono font-bold text-loss">{formatCurrency(result.total_sold)}</p>
              </div>
              <div className="p-2 rounded-lg bg-muted/50">
                <p className="text-[9px] text-muted-foreground">Taxas</p>
                <p className="text-xs font-mono font-bold">{formatCurrency(result.total_fees)}</p>
              </div>
            </div>

            {/* Import button */}
            {!imported ? (
              <button
                onClick={importTrades}
                disabled={importing}
                className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {importing ? 'Importando...' : `Importar ${result.trades.length} operações`}
              </button>
            ) : (
              <div className="flex items-center justify-center gap-2 py-3 text-gain">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Importação concluída!</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
