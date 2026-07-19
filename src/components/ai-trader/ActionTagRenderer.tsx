import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bell, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface ParsedAction {
  raw: string;
  type: 'create-alert';
  ticker: string;
  price: number;
  direction: 'above' | 'below';
  note?: string;
}

const ACTION_RE = /\[\[ACTION:([^\]]+)\]\]/g;

function parseActions(content: string): { clean: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const clean = content.replace(ACTION_RE, (raw, body) => {
    const parts = String(body).split('|').map((s) => s.trim());
    const kind = parts[0];
    if (kind !== 'create-alert') return '';
    const kv: Record<string, string> = {};
    for (const p of parts.slice(1)) {
      const [k, ...rest] = p.split('=');
      if (k) kv[k.trim()] = rest.join('=').trim();
    }
    const ticker = (kv.ticker || '').toUpperCase();
    const price = parseFloat((kv.price || '').replace(',', '.'));
    const direction = (kv.type === 'below' ? 'below' : 'above') as 'above' | 'below';
    if (!ticker || !isFinite(price)) return '';
    actions.push({ raw, type: 'create-alert', ticker, price, direction, note: kv.note });
    return '';
  });
  return { clean: clean.trim(), actions };
}

function ActionCard({ action }: { action: ParsedAction }) {
  const { user } = useAuth();
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');

  const apply = async () => {
    if (!user) return;
    setState('saving');
    const { error } = await supabase.from('alerts').insert({
      user_id: user.id,
      ticker: action.ticker,
      condition: action.direction === 'above' ? 'price_above' : 'price_below',
      target_value: action.price,
      is_active: true,
      note: action.note || `Sugestão AI Trader (${action.direction === 'above' ? 'alvo' : 'stop'})`,
    } as never);
    if (error) {
      toast.error('Falha ao criar alerta: ' + error.message);
      setState('idle');
      return;
    }
    toast.success(`Alerta criado para ${action.ticker} @ R$${action.price.toFixed(2)}`);
    setState('done');
  };

  return (
    <button
      onClick={apply}
      disabled={state !== 'idle'}
      className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
    >
      {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
       state === 'done'   ? <Check className="h-3.5 w-3.5" /> :
                            <Bell className="h-3.5 w-3.5" />}
      {state === 'done' ? 'Alerta criado' :
        `Criar alerta ${action.ticker} ${action.direction === 'above' ? '≥' : '≤'} R$${action.price.toFixed(2)}`}
    </button>
  );
}

export function ActionTagRenderer({ content }: { content: string }) {
  const { clean, actions } = useMemo(() => parseActions(content), [content]);
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{clean}</ReactMarkdown>
      {actions.length > 0 && (
        <div className="not-prose mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
          {actions.map((a, i) => <ActionCard key={i} action={a} />)}
        </div>
      )}
    </div>
  );
}

export { parseActions };
