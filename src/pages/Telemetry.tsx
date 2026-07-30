import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, AlertCircle, Activity, ShieldAlert, DollarSign, Database, ListChecks } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface RouteRow {
  function_name: string;
  calls: number;
  avg_ms: number;
  p95_ms: number;
  max_ms: number;
  error_rate: number;
  cache_hit_rate: number;
  cold_starts: number;
  tokens: number;
}

interface Dashboard {
  since: string;
  generated_at: string;
  routes: RouteRow[];
  rejections: { total: number; rate_limited: number; denied: number; by_function: Record<string, number> };
  ai: { calls: number; tokens_in: number; tokens_out: number; estimated_cost_usd: number; cache_hit_rate: number | null };
  cache: { entries: number; live_entries: number; total_hits: number; by_namespace: Record<string, { entries: number; hits: number }> };
  queue: { pending: number; running: number; failed: number; done: number; avg_duration_ms: number };
  timeline: { bucket: string; calls: number; avg_ms: number; errors: number }[];
}

/** Limiares espelham os do alerta automático (observability-alerts). */
const P95_ALERT_MS = 6000;
const ERROR_ALERT_PCT = 10;

export default function Telemetry() {
  const { user } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [hours, setHours] = useState("24");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: adminCheck } = await (supabase as any).rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      setIsAdmin(!!adminCheck);
      if (!adminCheck) { setLoading(false); return; }

      const { data: dash, error: rpcErr } = await (supabase as any).rpc(
        "get_observability_dashboard",
        { _hours: Number(hours) },
      );
      if (rpcErr) throw rpcErr;
      setData(dash as Dashboard);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, hours]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh a cada 60s para acompanhar incidentes em tempo quase real.
  useEffect(() => {
    const id = window.setInterval(load, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <Card className="max-w-lg mx-auto mt-10">
        <CardHeader><CardTitle className="flex gap-2 items-center"><AlertCircle className="h-5 w-5 text-destructive" />Acesso restrito</CardTitle></CardHeader>
        <CardContent>Somente administradores podem visualizar a telemetria.</CardContent>
      </Card>
    );
  }

  const routes = data?.routes ?? [];
  const totalCalls = routes.reduce((a, r) => a + Number(r.calls || 0), 0);
  const slowRoutes = routes.filter((r) => Number(r.p95_ms) > P95_ALERT_MS);
  const errorRoutes = routes.filter((r) => Number(r.error_rate) > ERROR_ALERT_PCT);
  const cacheEntries = data?.cache?.by_namespace ?? {};

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Observabilidade</h1>
          <p className="text-sm text-muted-foreground">
            Latência por rota, rejeições, custo de IA, cache e fila de tarefas
            {data && ` · atualizado ${new Date(data.generated_at).toLocaleTimeString("pt-BR")}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última hora</SelectItem>
              <SelectItem value="6">6 horas</SelectItem>
              <SelectItem value="24">24 horas</SelectItem>
              <SelectItem value="168">7 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {error && <Card><CardContent className="p-4 text-destructive text-sm">{error}</CardContent></Card>}

      {(slowRoutes.length > 0 || errorRoutes.length > 0) && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" /> Gargalos detectados
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            {slowRoutes.map((r) => (
              <div key={`slow-${r.function_name}`}>
                🐌 <span className="font-mono">{r.function_name}</span> — p95 {Number(r.p95_ms).toFixed(0)}ms
              </div>
            ))}
            {errorRoutes.map((r) => (
              <div key={`err-${r.function_name}`}>
                💥 <span className="font-mono">{r.function_name}</span> — {Number(r.error_rate).toFixed(1)}% de erros
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" />Chamadas</div>
          <div className="text-2xl font-bold">{totalCalls.toLocaleString("pt-BR")}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Rejeições</div>
          <div className="text-2xl font-bold text-amber-500">{data?.rejections?.total ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">{data?.rejections?.rate_limited ?? 0} por limite</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Custo IA</div>
          <div className="text-2xl font-bold">US${Number(data?.ai?.estimated_cost_usd ?? 0).toFixed(3)}</div>
          <div className="text-[11px] text-muted-foreground">
            {(Number(data?.ai?.tokens_in ?? 0) + Number(data?.ai?.tokens_out ?? 0)).toLocaleString("pt-BR")} tokens
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Database className="h-3 w-3" />Cache</div>
          <div className="text-2xl font-bold text-emerald-500">{data?.cache?.total_hits ?? 0}</div>
          <div className="text-[11px] text-muted-foreground">{data?.cache?.live_entries ?? 0} entradas válidas</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><ListChecks className="h-3 w-3" />Fila</div>
          <div className="text-2xl font-bold">{(data?.queue?.pending ?? 0) + (data?.queue?.running ?? 0)}</div>
          <div className="text-[11px] text-muted-foreground">
            {data?.queue?.failed ?? 0} falhas · {Math.round(Number(data?.queue?.avg_duration_ms ?? 0))}ms médio
          </div>
        </CardContent></Card>
      </div>

      {(data?.timeline?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Latência média por hora</CardTitle></CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data!.timeline}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="bucket" tickFormatter={(v: string) => v.slice(11, 16)} fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  labelFormatter={(v) => new Date(String(v)).toLocaleString("pt-BR")}
                />
                <Area type="monotone" dataKey="avg_ms" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" name="ms" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Por rota</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-3">Função</th>
                <th className="p-3 text-right">Chamadas</th>
                <th className="p-3 text-right">Média (ms)</th>
                <th className="p-3 text-right">P95 (ms)</th>
                <th className="p-3 text-right">Máx (ms)</th>
                <th className="p-3 text-right">Cache</th>
                <th className="p-3 text-right">Cold start</th>
                <th className="p-3 text-right">Erros</th>
                <th className="p-3 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {routes.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Sem dados na janela selecionada.</td></tr>
              )}
              {routes.map((r) => (
                <tr key={r.function_name} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 font-mono text-xs">{r.function_name}</td>
                  <td className="p-3 text-right">{r.calls}</td>
                  <td className="p-3 text-right">{Number(r.avg_ms || 0).toFixed(0)}</td>
                  <td className={`p-3 text-right ${Number(r.p95_ms) > P95_ALERT_MS ? "text-destructive font-semibold" : ""}`}>
                    {Number(r.p95_ms || 0).toFixed(0)}
                  </td>
                  <td className="p-3 text-right">{Number(r.max_ms || 0).toFixed(0)}</td>
                  <td className="p-3 text-right">{Number(r.cache_hit_rate || 0).toFixed(0)}%</td>
                  <td className="p-3 text-right">{r.cold_starts ?? 0}</td>
                  <td className="p-3 text-right">
                    {Number(r.error_rate) > 0
                      ? <Badge variant="destructive">{Number(r.error_rate).toFixed(1)}%</Badge>
                      : "0"}
                  </td>
                  <td className="p-3 text-right">{Number(r.tokens || 0).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Cache por namespace</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.keys(cacheEntries).length === 0 && (
              <p className="text-muted-foreground">Nenhuma entrada em cache ainda.</p>
            )}
            {Object.entries(cacheEntries).map(([ns, v]) => (
              <div key={ns} className="flex justify-between border-b border-border/50 pb-1">
                <span className="font-mono text-xs">{ns}</span>
                <span className="text-muted-foreground">{v.entries} entradas · {v.hits} reaproveitamentos</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Rejeições por rota</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {Object.keys(data?.rejections?.by_function ?? {}).length === 0 && (
              <p className="text-muted-foreground">Nenhuma rejeição na janela. 👌</p>
            )}
            {Object.entries(data?.rejections?.by_function ?? {}).map(([fn, count]) => (
              <div key={fn} className="flex justify-between border-b border-border/50 pb-1">
                <span className="font-mono text-xs">{fn}</span>
                <span className="text-amber-500">{count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
