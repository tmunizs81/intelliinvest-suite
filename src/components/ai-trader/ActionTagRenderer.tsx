import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Bell, Check, Loader2, Shield, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolio } from '@/hooks/usePortfolio';
import { toast } from 'sonner';

const AUTO_APPLY_KEY = 'ai_risk_auto_apply';
const APPLIED_TAGS_KEY = 'ai_risk_applied_tags';

export interface ParsedAlertAction {
  raw: string;
  type: 'create-alert';
  ticker: string;
  price: number;
  direction: 'above' | 'below';
  note?: string;
}

export interface ParsedRiskAction {
  raw: string;
  type: 'risk-alert';
  ticker: string;
  stopPct: number;   // ex: -8 (%)
  targetPct: number; // ex: 15 (%)
  volPct: number;    // ex: 30 (%) - max drawdown/vol in window
  windowDays: number; // ex: 30
  refPrice?: number;
  note?: string;
}

type AnyAction = ParsedAlertAction | ParsedRiskAction;

const ACTION_RE = /\[\[ACTION:([^\]]+)\]\]/g;

function parseKV(body: string): Record<string, string> {
  const kv: Record<string, string> = {};
  const parts = body.split('|').map((s) => s.trim());
  for (const p of parts.slice(1)) {
    const [k, ...rest] = p.split('=');
    if (k) kv[k.trim()] = rest.join('=').trim();
  }
  kv.__kind = parts[0];
  return kv;
}

function parseActions(content: string): { clean: string; actions: AnyAction[] } {
  const actions: AnyAction[] = [];
  const clean = content.replace(ACTION_RE, (raw, body) => {
    const kv = parseKV(String(body));
    const kind = kv.__kind;
    const ticker = (kv.ticker || '').toUpperCase();
    if (!ticker) return '';

    if (kind === 'create-alert') {
      const price = parseFloat((kv.price || '').replace(',', '.'));
      if (!isFinite(price)) return '';
      const direction = (kv.type === 'below' ? 'below' : 'above') as 'above' | 'below';
      actions.push({ raw, type: 'create-alert', ticker, price, direction, note: kv.note });
      return '';
    }

    if (kind === 'risk-alert') {
      const stopPct = parseFloat((kv.stop_pct || kv.stop || '-8').replace(',', '.'));
      const targetPct = parseFloat((kv.target_pct || kv.target || '15').replace(',', '.'));
      const volPct = parseFloat((kv.vol_pct || kv.vol || '25').replace(',', '.'));
      const windowDays = parseInt((kv.window || '30').replace(/[^0-9]/g, ''), 10) || 30;
      const refPrice = kv.ref ? parseFloat(kv.ref.replace(',', '.')) : undefined;
      actions.push({
        raw, type: 'risk-alert', ticker,
        stopPct: isFinite(stopPct) ? stopPct : -8,
        targetPct: isFinite(targetPct) ? targetPct : 15,
        volPct: isFinite(volPct) ? volPct : 25,
        windowDays, refPrice, note: kv.note,
      });
      return '';
    }
    return '';
  });
  return { clean: clean.trim(), actions };
}

function hashTag(raw: string): string {
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  return String(h);
}

function isApplied(raw: string): boolean {
  try {
    const set = JSON.parse(localStorage.getItem(APPLIED_TAGS_KEY) || '[]') as string[];
    return set.includes(hashTag(raw));
  } catch { return false; }
}
function markApplied(raw: string) {
  try {
    const set = JSON.parse(localStorage.getItem(APPLIED_TAGS_KEY) || '[]') as string[];
    set.push(hashTag(raw));
    localStorage.setItem(APPLIED_TAGS_KEY, JSON.stringify(set.slice(-500)));
  } catch { /* ignore */ }
}

function AlertCard({ action }: { action: ParsedAlertAction }) {
  const { user } = useAuth();
  const [state, setState] = useState<'idle' | 'saving' | 'done'>(
    isApplied(action.raw) ? 'done' : 'idle',
  );

  const apply = async () => {
    if (!user) return;
    setState('saving');
    const { error } = await supabase.from('alerts').insert({
      user_id: user.id,
      ticker: action.ticker,
      name: `AI Trader — ${action.ticker} ${action.direction === 'above' ? '≥' : '≤'} R$${action.price.toFixed(2)}`,
      alert_type: action.direction === 'above' ? 'price_above' : 'price_below',
      target_value: action.price,
      condition_logic: 'AND',
      status: 'active',
      notify_email: true,
      notify_telegram: false,
      notes: action.note || 'Sugestão AI Trader',
    } as never);
    if (error) {
      toast.error('Falha ao criar alerta: ' + error.message);
      setState('idle');
      return;
    }
    markApplied(action.raw);
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

function RiskCard({ action, autoApply }: { action: ParsedRiskAction; autoApply: boolean }) {
  const { user } = useAuth();
  const { assets } = usePortfolio();
  const priceFromPortfolio = useMemo(
    () => assets.find(a => a.ticker.toUpperCase() === action.ticker)?.currentPrice,
    [assets, action.ticker],
  );
  const ref = priceFromPortfolio ?? action.refPrice ?? 0;

  // Editable state (parametrizável)
  const [stopPct, setStopPct] = useState<number>(action.stopPct);
  const [targetPct, setTargetPct] = useState<number>(action.targetPct);
  const [volPct, setVolPct] = useState<number>(action.volPct);
  const [windowDays, setWindowDays] = useState<number>(action.windowDays);
  const [state, setState] = useState<'idle' | 'saving' | 'done'>(
    isApplied(action.raw) ? 'done' : 'idle',
  );

  const stopPrice = ref > 0 ? +(ref * (1 + stopPct / 100)).toFixed(2) : 0;
  const targetPrice = ref > 0 ? +(ref * (1 + targetPct / 100)).toFixed(2) : 0;

  const apply = async () => {
    if (!user) return;
    if (ref <= 0) {
      toast.error(`${action.ticker}: preço de referência indisponível — abra a carteira e atualize as cotações.`);
      return;
    }
    setState('saving');
    const validUntil = new Date(Date.now() + windowDays * 86400_000).toISOString();
    const rows = [
      {
        user_id: user.id,
        ticker: action.ticker,
        name: `Risco IA — Stop ${action.ticker} ${stopPct.toFixed(1)}%`,
        alert_type: 'stop_loss',
        target_value: stopPrice,
        secondary_type: 'variation_down',
        secondary_value: Math.abs(volPct),
        condition_logic: 'OR',
        status: 'active',
        notify_email: true,
        notify_telegram: true,
        valid_until: validUntil,
        notes: `AI risk-alert (${windowDays}d). ${action.note || ''}`.trim(),
      },
      {
        user_id: user.id,
        ticker: action.ticker,
        name: `Alvo IA — Take Profit ${action.ticker} +${targetPct.toFixed(1)}%`,
        alert_type: 'take_profit',
        target_value: targetPrice,
        condition_logic: 'AND',
        status: 'active',
        notify_email: true,
        notify_telegram: true,
        valid_until: validUntil,
        notes: `AI risk-alert (${windowDays}d). ${action.note || ''}`.trim(),
      },
    ];
    const { error } = await supabase.from('alerts').insert(rows as never);
    if (error) {
      toast.error('Falha ao criar alertas de risco: ' + error.message);
      setState('idle');
      return;
    }
    markApplied(action.raw);
    toast.success(`Gatilhos de risco criados para ${action.ticker}`);
    setState('done');
  };

  // Auto-apply once per unique tag
  useEffect(() => {
    if (autoApply && state === 'idle' && ref > 0 && !isApplied(action.raw)) {
      apply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, ref]);

  return (
    <div className="not-prose rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
      <div className="flex items-center gap-2 mb-2 font-semibold text-amber-500">
        <Shield className="h-4 w-4" />
        Gatilho de risco IA — {action.ticker}
        {ref > 0 && <span className="text-muted-foreground font-normal">· ref R${ref.toFixed(2)}</span>}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Stop %</span>
          <input type="number" step="0.5" value={stopPct}
            onChange={(e) => setStopPct(parseFloat(e.target.value) || 0)}
            className="h-7 rounded border border-border bg-background px-2 font-mono" />
          <span className="text-[10px] text-muted-foreground">→ R${stopPrice.toFixed(2)}</span>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Alvo %</span>
          <input type="number" step="0.5" value={targetPct}
            onChange={(e) => setTargetPct(parseFloat(e.target.value) || 0)}
            className="h-7 rounded border border-border bg-background px-2 font-mono" />
          <span className="text-[10px] text-muted-foreground">→ R${targetPrice.toFixed(2)}</span>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Vol/DD máx %</span>
          <input type="number" step="1" value={volPct}
            onChange={(e) => setVolPct(parseFloat(e.target.value) || 0)}
            className="h-7 rounded border border-border bg-background px-2 font-mono" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-muted-foreground">Janela (dias)</span>
          <input type="number" step="1" min="1" value={windowDays}
            onChange={(e) => setWindowDays(parseInt(e.target.value) || 30)}
            className="h-7 rounded border border-border bg-background px-2 font-mono" />
        </label>
      </div>
      <button
        onClick={apply}
        disabled={state !== 'idle'}
        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-60"
      >
        {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
         state === 'done'   ? <Check className="h-3.5 w-3.5" /> :
                              <Zap className="h-3.5 w-3.5" />}
        {state === 'done' ? 'Gatilhos ativos' : 'Criar Stop + Alvo + Vol'}
      </button>
      {action.note && <div className="mt-2 text-[11px] text-muted-foreground italic">{action.note}</div>}
    </div>
  );
}

function AutoApplyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="not-prose inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      Auto-aplicar gatilhos de risco sugeridos
    </label>
  );
}

export function ActionTagRenderer({ content }: { content: string }) {
  const { clean, actions } = useMemo(() => parseActions(content), [content]);
  const [autoApply, setAutoApply] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_APPLY_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(AUTO_APPLY_KEY, autoApply ? '1' : '0'); } catch { /* ignore */ }
  }, [autoApply]);

  const alertActions = actions.filter((a): a is ParsedAlertAction => a.type === 'create-alert');
  const riskActions = actions.filter((a): a is ParsedRiskAction => a.type === 'risk-alert');

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown>{clean}</ReactMarkdown>
      {(alertActions.length > 0 || riskActions.length > 0) && (
        <div className="not-prose mt-3 space-y-3 border-t border-border/50 pt-3">
          {riskActions.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-500">
                {riskActions.length} gatilho(s) de risco sugerido(s)
              </span>
              <AutoApplyToggle value={autoApply} onChange={setAutoApply} />
            </div>
          )}
          {riskActions.map((a, i) => <RiskCard key={`r${i}`} action={a} autoApply={autoApply} />)}
          {alertActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {alertActions.map((a, i) => <AlertCard key={`a${i}`} action={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { parseActions };
