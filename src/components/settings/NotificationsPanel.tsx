import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, RefreshCw, Bell } from 'lucide-react';

type Log = {
  id: string; kind: string; channel: string; status: string;
  error: string | null; sent_at: string; payload: any;
};

const KIND_LABELS: Record<string, string> = {
  patrimony_drop: 'Queda', patrimony_gain: 'Ganho', daily_valuation: 'Variação diária',
  roi_threshold: 'ROI', fx_stale: 'FX', daily_summary: 'Resumo', manual: 'Manual',
};

const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-gain/10 text-gain', failed: 'bg-destructive/10 text-destructive',
  suppressed_cooldown: 'bg-amber-500/10 text-amber-400',
};

export function NotificationsPanel() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [stats, setStats] = useState({ sent: 0, failed: 0, suppressed: 0 });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    let q = supabase.from('notification_log').select('*')
      .eq('user_id', user.id).gte('sent_at', since)
      .order('sent_at', { ascending: false }).limit(200);
    if (kindFilter) q = q.eq('kind', kindFilter);
    if (statusFilter) q = q.eq('status', statusFilter);
    const { data } = await q;
    const list = (data ?? []) as Log[];
    setLogs(list);

    // 7d stats
    const sevenDays = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const recent = list.filter(l => l.sent_at >= sevenDays);
    setStats({
      sent: recent.filter(l => l.status === 'sent').length,
      failed: recent.filter(l => l.status === 'failed').length,
      suppressed: recent.filter(l => l.status === 'suppressed_cooldown').length,
    });
    setLoading(false);
  }, [user, kindFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><Bell className="h-4 w-4" /> Notificações Enviadas</h2>
        <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {/* Stats 7d */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Enviadas (7d)</p>
          <p className="text-2xl font-bold text-gain">{stats.sent}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Falhas (7d)</p>
          <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="text-xs text-muted-foreground">Suprimidas (7d)</p>
          <p className="text-2xl font-bold text-amber-400">{stats.suppressed}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
          <option value="">Todos os tipos</option>
          {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
          <option value="">Todos os status</option>
          <option value="sent">Enviada</option>
          <option value="failed">Falhou</option>
          <option value="suppressed_cooldown">Suprimida (cooldown)</option>
        </select>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="p-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma notificação nos últimos 30 dias.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs">
                <th className="text-left p-2 font-medium">Quando</th>
                <th className="text-left p-2 font-medium">Tipo</th>
                <th className="text-left p-2 font-medium">Canal</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-left p-2 font-medium">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="p-2 text-xs whitespace-nowrap">{new Date(l.sent_at).toLocaleString('pt-BR')}</td>
                  <td className="p-2">{KIND_LABELS[l.kind] ?? l.kind}</td>
                  <td className="p-2 text-xs uppercase">{l.channel}</td>
                  <td className="p-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[l.status] ?? 'bg-muted'}`}>
                      {l.status === 'sent' ? 'Enviada' : l.status === 'failed' ? 'Falha' : 'Suprimida'}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-muted-foreground max-w-[300px] truncate" title={l.error ?? JSON.stringify(l.payload)}>
                    {l.error ?? (l.payload?.variationPct !== undefined ? `Δ ${Number(l.payload.variationPct).toFixed(2)}%` : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
