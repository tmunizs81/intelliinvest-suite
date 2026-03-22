import { useState, useRef, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { type Asset } from '@/lib/mockData';
import { useAIRateLimit } from '@/hooks/useAIRateLimit';
import { getCached, setCache, CACHE_TTL } from '@/lib/persistentCache';
import { Bot, Send, Loader2, Sparkles } from 'lucide-react';
const ReactMarkdown = lazy(() => import('react-markdown'));

interface Props {
  assets: Asset[];
  cashBalance?: number;
}

const QUICK_QUESTIONS = [
  'O que devo comprar agora?',
  'Quais ativos devo vender?',
  'Como diversificar melhor?',
  'Análise completa da carteira',
];

export default function AIAdvisorPanel({ assets, cashBalance = 0 }: Props) {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const { canCall, recordCall } = useAIRateLimit();
  const abortRef = useRef<AbortController | null>(null);

  const ask = async (q: string) => {
    if (!canCall() || assets.length === 0) return;
    recordCall();
    setLoading(true);
    setResponse('');
    setQuestion(q);

    // Check persistent cache
    const tickers = assets.map(a => a.ticker).sort().join(',');
    const cacheKey = `ai-advisor:${tickers}:${q}`;
    const cached = await getCached<string>(cacheKey);
    if (cached) {
      setResponse(cached);
      setLoading(false);
      return;
    }

    try {
      abortRef.current = new AbortController();
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-advisor`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ assets, cashBalance, question: q }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) throw new Error('Erro na resposta');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setResponse(fullText);
            }
          } catch {}
        }
      }

      // Cache the complete response
      if (fullText) {
        await setCache(cacheKey, fullText, CACHE_TTL.AI_RESPONSE);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setResponse('❌ Erro ao consultar o advisor. Tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-fade-in h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg bg-ai/10 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 text-ai-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Consultor IA</h3>
          <p className="text-[10px] text-muted-foreground">Recomendações personalizadas</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!response && !loading && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Pergunte ao consultor IA sobre sua carteira:</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  disabled={assets.length === 0}
                  className="text-left p-2.5 rounded-lg bg-muted/50 border border-border hover:border-primary/30 hover:bg-primary/5 text-xs transition-all disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3 text-primary mb-1" />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading && !response && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Analisando sua carteira...</span>
          </div>
        )}

        {response && (
          <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed">
            <ReactMarkdown>{response}</ReactMarkdown>
          </div>
        )}
      </div>

      {response && (
        <div className="p-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && question.trim() && ask(question)}
              placeholder="Faça outra pergunta..."
              className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              onClick={() => question.trim() && ask(question)}
              disabled={loading || !question.trim()}
              className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
