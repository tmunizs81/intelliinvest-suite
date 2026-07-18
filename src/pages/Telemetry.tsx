import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface Row {
  function_name: string;
  calls: number;
  avg_ms: number;
  p95_ms: number;
  cache_hits: number;
  errors: number;
  tokens_in: number;
  tokens_out: number;
}

export default function Telemetry() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: adminCheck } = await (supabase as any).rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      setIsAdmin(!!adminCheck);
      if (!adminCheck) { setLoading(false); return; }

      const { data, error: qErr } = await (supabase as any)
        .from("function_metrics_24h")
        .select("*");
      if (qErr) throw qErr;
      setRows((data || []) as Row[]);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <Card className="max-w-lg mx-auto mt-10">
        <CardHeader><CardTitle className="flex gap-2 items-center"><AlertCircle className="h-5 w-5 text-destructive"/>Acesso restrito</CardTitle></CardHeader>
        <CardContent>Somente administradores podem visualizar a telemetria.</CardContent>
      </Card>
    );
  }

  const totals = rows.reduce(
    (a, r) => ({
      calls: a.calls + Number(r.calls || 0),
      errors: a.errors + Number(r.errors || 0),
      cache: a.cache + Number(r.cache_hits || 0),
      tokens: a.tokens + Number(r.tokens_in || 0) + Number(r.tokens_out || 0),
    }),
    { calls: 0, errors: 0, cache: 0, tokens: 0 },
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Telemetria (24h)</h1>
          <p className="text-sm text-muted-foreground">Métricas de todas as Edge Functions</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Atualizar
        </Button>
      </div>

      {error && <Card><CardContent className="p-4 text-destructive text-sm">{error}</CardContent></Card>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Chamadas</div><div className="text-2xl font-bold">{totals.calls}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Erros</div><div className="text-2xl font-bold text-destructive">{totals.errors}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Cache hits</div><div className="text-2xl font-bold text-green-500">{totals.cache}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Tokens IA</div><div className="text-2xl font-bold">{totals.tokens.toLocaleString()}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Por função</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Função</th>
                <th className="p-3 text-right">Chamadas</th>
                <th className="p-3 text-right">Média (ms)</th>
                <th className="p-3 text-right">P95 (ms)</th>
                <th className="p-3 text-right">Cache</th>
                <th className="p-3 text-right">Erros</th>
                <th className="p-3 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Sem dados nas últimas 24h.</td></tr>
              )}
              {rows.map((r) => {
                const errRate = r.calls > 0 ? (r.errors / r.calls) * 100 : 0;
                return (
                  <tr key={r.function_name} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{r.function_name}</td>
                    <td className="p-3 text-right">{r.calls}</td>
                    <td className="p-3 text-right">{Number(r.avg_ms || 0).toFixed(0)}</td>
                    <td className="p-3 text-right">{Number(r.p95_ms || 0).toFixed(0)}</td>
                    <td className="p-3 text-right">{r.cache_hits}</td>
                    <td className="p-3 text-right">
                      {r.errors > 0 ? <Badge variant="destructive">{r.errors} ({errRate.toFixed(1)}%)</Badge> : "0"}
                    </td>
                    <td className="p-3 text-right">{(Number(r.tokens_in||0)+Number(r.tokens_out||0)).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
