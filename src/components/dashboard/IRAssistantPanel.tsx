import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { Loader2, FileText, Sparkles, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function IRAssistantPanel({ assets }: { assets: Asset[] }) {
  const [guide, setGuide] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-ir-assistant', {
        body: {
          assets: assets.map(a => ({ ticker: a.ticker, name: a.name, type: a.type, quantity: a.quantity, avgPrice: a.avgPrice, currentPrice: a.currentPrice })),
          year: new Date().getFullYear() - 1,
        },
      });
      if (fnError) throw new Error(fnError.message);
      setGuide(data?.guide || 'Nenhum guia gerado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [assets]);

  return (
    <div className="p-4 space-y-3">
      {!guide && !loading && !error && (
        <button onClick={generate}
          className="w-full py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-all">
          <FileText className="h-8 w-8" />
          <span className="text-xs font-medium">Gerar Guia de Declaração IR</span>
          <span className="text-[10px]">Passo-a-passo personalizado baseado na sua carteira</span>
        </button>
      )}

      {loading && (
        <div className="flex flex-col items-center py-8 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Gerando guia personalizado...</p>
        </div>
      )}

      {error && <p className="text-xs text-loss">⚠️ {error}</p>}

      {guide && !loading && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-primary flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Guia Personalizado</p>
            <button onClick={generate} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed
            prose-headings:text-foreground prose-p:text-foreground/90 prose-li:text-foreground/90
            prose-strong:text-foreground prose-code:text-primary">
            <ReactMarkdown>{guide}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
