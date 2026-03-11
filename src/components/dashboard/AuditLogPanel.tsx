import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  created_at: string;
}

const actionLabels: Record<string, string> = {
  buy: '🟢 Compra',
  sell: '🔴 Venda',
  delete: '🗑️ Exclusão',
  update: '✏️ Edição',
  add: '➕ Adição',
};

export default function AuditLogPanel() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs' as any)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    setLogs((data as any[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Registro de Atividades
        </h3>
        <button onClick={load} disabled={loading}
          className="h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all disabled:opacity-50">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      {logs.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade registrada ainda.</p>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {logs.map(log => (
          <div key={log.id} className="rounded-lg bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{actionLabels[log.action] || log.action}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(log.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {log.entity_type}{log.entity_id ? `: ${log.entity_id}` : ''}
              {log.details?.ticker ? ` • ${log.details.ticker}` : ''}
              {log.details?.quantity ? ` • ${log.details.quantity}un` : ''}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
