import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Send, Sparkles, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Msg { role: 'user' | 'assistant'; content: string }

interface Props {
  context?: string; // resumo da carteira para grounding
}

const SUGESTOES = [
  'Como declaro FIIs no IRPF?',
  'Posso compensar prejuízo de FII com lucro de ação?',
  'Quando devo pagar DARF de cripto?',
  'O que preencher se vendi menos de R$20k no mês?',
];

export default function TaxChatPanel({ context }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const next = [...messages, { role: 'user' as const, content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-tax-chat', {
        body: { messages: next, context },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setMessages(m => [...m, { role: 'assistant', content: (data as any)?.reply || 'Sem resposta.' }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message || 'Erro'}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col h-[600px]">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Assistente IA — Dúvidas de IRPF
        </h3>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="text-[10px] text-muted-foreground hover:text-loss flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> Limpar
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8 space-y-4">
            <Sparkles className="h-10 w-10 text-primary/30 mx-auto" />
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Pergunte qualquer dúvida sobre declaração de imposto de renda de investimentos.
              A IA usa a legislação vigente e o contexto da sua carteira.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto pt-2">
              {SUGESTOES.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-border bg-muted/30 hover:bg-primary/10 hover:border-primary/30 transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-2.5 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 border border-border'}`}>
              {m.role === 'user' ? (
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed
                  prose-p:my-1.5 prose-headings:text-foreground prose-p:text-foreground/90
                  prose-li:text-foreground/90 prose-strong:text-foreground prose-code:text-primary">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted/40 border border-border rounded-xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">Contadoria IA pensando...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); send(input); }}
        className="border-t border-border p-3 flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          disabled={loading}
          placeholder="Ex: como declaro dividendos de FII?"
          className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50" />
        <button type="submit" disabled={loading || !input.trim()}
          className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50 transition-all">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
