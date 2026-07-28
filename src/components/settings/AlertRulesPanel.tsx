import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, Bell, Save } from 'lucide-react';

type Rule = {
  id: string; user_id: string; kind: string;
  threshold_pct: number | null; threshold_minutes: number | null;
  enabled: boolean; cooldown_minutes: number;
  meta?: { market?: string } | null;
};

const KIND_META: Record<string, { label: string; unit: 'pct' | 'min' | 'none'; default: number; help: string }> = {
  patrimony_drop:  { label: 'Queda de patrimônio',    unit: 'pct', default: 3,  help: 'Alerta quando o patrimônio cair mais que X% vs último snapshot.' },
  patrimony_gain:  { label: 'Ganho de patrimônio',    unit: 'pct', default: 5,  help: 'Alerta quando o patrimônio subir mais que X%.' },
  daily_valuation: { label: 'Variação diária',        unit: 'pct', default: 2,  help: 'Alerta em qualquer direção se |Δ| ≥ X%.' },
  roi_threshold:   { label: 'ROI acumulado',           unit: 'pct', default: 20, help: 'Alerta quando ROI acumulado cruzar ±X%.' },
  fx_stale:        { label: 'FX desatualizado',       unit: 'min', default: 120, help: 'Alerta se cotações FX não atualizarem há N minutos.' },
  daily_summary:   { label: 'Resumo diário 09:00',    unit: 'none', default: 0,  help: 'Envia um resumo consolidado toda manhã às 09:00 (BRT).' },
  market_open:     { label: 'Abertura de bolsa',      unit: 'none', default: 0,  help: 'Alerta assim que a bolsa selecionada abrir (B3, NYSE, NASDAQ, LSE, TSE ou todas).' },
  market_close:    { label: 'Fechamento de bolsa',    unit: 'none', default: 0,  help: 'Alerta assim que a bolsa selecionada fechar.' },
};

const MARKET_OPTIONS = [
  { code: 'ALL', label: 'Todas' },
  { code: 'B3', label: 'B3' },
  { code: 'NYSE', label: 'NYSE' },
  { code: 'NASDAQ', label: 'NASDAQ' },
  { code: 'LSE', label: 'Londres' },
  { code: 'TSE', label: 'Tóquio' },
];

const ORDER = ['patrimony_drop','patrimony_gain','daily_valuation','roi_threshold','fx_stale','daily_summary','market_open','market_close'];

export function AlertRulesPanel() {
  const { user } = useAuth();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('alert_rules').select('*').eq('user_id', user.id);
    let list = (data ?? []) as Rule[];
    // Ensure every kind exists
    const existing = new Set(list.map(r => r.kind));
    const missing = ORDER.filter(k => !existing.has(k));
    if (missing.length) {
      const inserts = missing.map(k => ({
        user_id: user.id, kind: k, enabled: false,
        threshold_pct: KIND_META[k].unit === 'pct' ? KIND_META[k].default : null,
        threshold_minutes: KIND_META[k].unit === 'min' ? KIND_META[k].default : null,
        cooldown_minutes: 60,
      }));
      const { data: newer } = await supabase.from('alert_rules').insert(inserts).select();
      list = [...list, ...((newer ?? []) as Rule[])];
    }
    list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
    setRules(list);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const patch = (id: string, changes: Partial<Rule>) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, ...changes } : r));

  const save = async (r: Rule) => {
    setSaving(r.id);
    const { error } = await supabase.from('alert_rules').update({
      enabled: r.enabled, threshold_pct: r.threshold_pct, threshold_minutes: r.threshold_minutes,
      cooldown_minutes: r.cooldown_minutes, meta: r.meta ?? {},
    }).eq('id', r.id);
    setSaving(null);
    if (error) toast.error(error.message); else toast.success('Regra salva');
  };

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <h2 className="font-semibold flex items-center gap-2"><Bell className="h-4 w-4" /> Regras de Alerta</h2>
      <p className="text-xs text-muted-foreground">Configure gatilhos para notificações via Telegram. Cada regra tem seu próprio cooldown para evitar spam.</p>

      <div className="space-y-3">
        {rules.map(r => {
          const meta = KIND_META[r.kind];
          return (
            <div key={r.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.help}</p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={r.enabled}
                    onChange={e => patch(r.id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-primary" />
                  <span className="text-xs font-medium">{r.enabled ? 'Ativa' : 'Inativa'}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {r.kind !== 'daily_summary' && (
                  <label className="text-xs space-y-1">
                    <span className="text-muted-foreground">{meta.unit === 'pct' ? 'Limite (%)' : 'Minutos'}</span>
                    <input type="number" step={meta.unit === 'pct' ? '0.1' : '1'}
                      value={meta.unit === 'pct' ? (r.threshold_pct ?? '') : (r.threshold_minutes ?? '')}
                      onChange={e => patch(r.id, meta.unit === 'pct'
                        ? { threshold_pct: parseFloat(e.target.value) || 0 }
                        : { threshold_minutes: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </label>
                )}
                <label className="text-xs space-y-1">
                  <span className="text-muted-foreground">Cooldown (min)</span>
                  <input type="number" min={0} value={r.cooldown_minutes}
                    onChange={e => patch(r.id, { cooldown_minutes: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                </label>
                <div className="flex items-end">
                  <button onClick={() => save(r)} disabled={saving === r.id}
                    className="w-full px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50">
                    {saving === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5" /> Salvar</>}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
