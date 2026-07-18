import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Zap } from 'lucide-react';

type DiagResult = {
  ok: boolean;
  status: string;
  http_status?: number;
  latency_ms?: number;
  model?: string;
  key_configured: boolean;
  key_prefix?: string | null;
  error?: string | null;
  timestamp: string;
};

type Sample = { at: string; latency_ms: number; ok: boolean };

export default function AIDiagnostics() {
  const [result, setResult] = useState<DiagResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('deepseek-diagnostics');
      if (error) throw error;
      const r = data as DiagResult;
      setResult(r);
      if (typeof r.latency_ms === 'number') {
        setSamples((s) => [...s.slice(-19), { at: new Date().toLocaleTimeString(), latency_ms: r.latency_ms!, ok: r.ok }]);
      }
    } catch (e) {
      setResult({
        ok: false, status: 'invoke_error', key_configured: false,
        error: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  const avg = samples.length ? Math.round(samples.reduce((a, s) => a + s.latency_ms, 0) / samples.length) : 0;
  const errors = samples.filter((s) => !s.ok).length;

  const statusBadge = () => {
    if (!result) return <Badge variant="secondary">Verificando…</Badge>;
    if (result.ok) return <Badge className="bg-emerald-600"><CheckCircle2 className="w-3 h-3 mr-1" />Saudável</Badge>;
    if (!result.key_configured) return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Sem chave</Badge>;
    return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Erro</Badge>;
  };

  const latColor = (ms: number) =>
    ms < 800 ? 'text-emerald-500' : ms < 2000 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" /> Diagnóstico de IA (DeepSeek)
          </h1>
          <p className="text-sm text-muted-foreground">Valida a chave, mede latência e monitora erros do provedor.</p>
        </div>
        <Button onClick={run} disabled={loading} size="sm">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Testar agora
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Status</CardTitle></CardHeader>
          <CardContent>{statusBadge()}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Chave configurada</CardTitle></CardHeader>
          <CardContent>
            {result?.key_configured ? (
              <span className="font-mono text-sm">{result.key_prefix ?? '••••'}</span>
            ) : <span className="text-red-500 text-sm">Não</span>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Latência atual</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${result?.latency_ms ? latColor(result.latency_ms) : ''}`}>
            {result?.latency_ms != null ? `${result.latency_ms} ms` : '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Média ({samples.length} amostras)</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${avg ? latColor(avg) : ''}`}>
            {avg ? `${avg} ms` : '—'}
            {errors > 0 && <span className="text-xs text-red-500 ml-2">{errors} erro(s)</span>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4" /> Detalhes da última chamada</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div><span className="text-muted-foreground">Endpoint:</span> <code>https://api.deepseek.com/chat/completions</code></div>
          <div><span className="text-muted-foreground">Modelo:</span> {result?.model ?? '—'}</div>
          <div><span className="text-muted-foreground">HTTP:</span> {result?.http_status ?? '—'}</div>
          <div><span className="text-muted-foreground">Timestamp:</span> {result?.timestamp ?? '—'}</div>
          {result?.error && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400">
              <div className="font-medium mb-1">Erro:</div>
              <div className="font-mono text-xs break-all">{result.error}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {samples.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Histórico de latência</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {samples.map((s, i) => {
                const h = Math.min(100, (s.latency_ms / 3000) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${s.at} • ${s.latency_ms}ms`}>
                    <div className={`w-full rounded-t ${s.ok ? 'bg-primary' : 'bg-red-500'}`} style={{ height: `${h}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{samples[0]?.at}</span><span>{samples[samples.length - 1]?.at}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
