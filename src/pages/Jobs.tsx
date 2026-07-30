import { useMemo, useState } from "react";
import { useJobQueue, type JobStatus, type QueueJob } from "@/hooks/useJobQueue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Clock, Loader2, CheckCircle2, XCircle, Ban, RefreshCw, RotateCcw, Inbox,
} from "lucide-react";

const STATUS_META: Record<JobStatus, { label: string; icon: typeof Clock; className: string }> = {
  pending: { label: "Em fila", icon: Clock, className: "text-amber-500 border-amber-500/40" },
  running: { label: "Em execução", icon: Loader2, className: "text-primary border-primary/40" },
  done: { label: "Concluída", icon: CheckCircle2, className: "text-emerald-500 border-emerald-500/40" },
  failed: { label: "Falhou", icon: XCircle, className: "text-destructive border-destructive/40" },
  cancelled: { label: "Cancelada", icon: Ban, className: "text-muted-foreground border-border" },
};

const TYPE_LABEL: Record<string, string> = {
  "ai-insights": "Insights da carteira (IA)",
  "ai-trader": "Análise AI Trader",
  "ai-risk-analysis": "Análise de risco (IA)",
  "ai-correlation": "Correlação entre ativos (IA)",
  "portfolio-rebalance": "Sugestão de rebalanceamento",
  "reconcile-snapshots": "Reconciliação de histórico",
  "monthly-report": "Relatório mensal",
  backtesting: "Backtesting",
};

function duration(job: QueueJob): string {
  if (job.duration_ms == null) return "—";
  const s = job.duration_ms / 1000;
  return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const FILTERS: { key: JobStatus | "all"; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "pending", label: "Em fila" },
  { key: "running", label: "Em execução" },
  { key: "done", label: "Concluídas" },
  { key: "failed", label: "Falharam" },
  { key: "cancelled", label: "Canceladas" },
];

export default function Jobs() {
  const { jobs, summary, loading, error, hasActive, refresh, cancel, retry } = useJobQueue();
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [pendingCancel, setPendingCancel] = useState<QueueJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((j) => j.status === filter)),
    [jobs, filter],
  );

  const confirmCancel = async () => {
    if (!pendingCancel) return;
    setBusy(pendingCancel.id);
    try {
      const res = await cancel(pendingCancel.id);
      if (res.ok) toast.success("Tarefa cancelada", { description: res.note });
      else toast.error("Não foi possível cancelar", { description: res.reason });
    } catch (e: any) {
      toast.error("Erro ao cancelar", { description: e?.message });
    } finally {
      setBusy(null);
      setPendingCancel(null);
    }
  };

  const handleRetry = async (job: QueueJob) => {
    setBusy(job.id);
    try {
      await retry(job.id);
      toast.success("Tarefa reenviada para a fila");
    } catch (e: any) {
      toast.error("Erro ao reprocessar", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tarefas em segundo plano</h1>
          <p className="text-sm text-muted-foreground">
            Análises de IA, relatórios e reconciliações processados fora da tela
            {hasActive && " · atualizando a cada 4s"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(Object.keys(STATUS_META) as JobStatus[]).map((s) => {
          const Icon = STATUS_META[s].icon;
          return (
            <Card
              key={s}
              className={`cursor-pointer transition ${filter === s ? "ring-1 ring-primary" : ""}`}
              onClick={() => setFilter(filter === s ? "all" : s)}
            >
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon className={`h-3 w-3 ${STATUS_META[s].className.split(" ")[0]}`} />
                  {STATUS_META[s].label}
                </div>
                <div className="text-2xl font-bold">{summary[s] ?? 0}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <Card><CardContent className="p-4 text-destructive text-sm">{error}</CardContent></Card>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {loading && jobs.length === 0 && (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          )}

          {!loading && visible.length === 0 && (
            <div className="flex flex-col items-center py-10 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Nenhuma tarefa {filter === "all" ? "registrada" : "neste estado"}.</p>
            </div>
          )}

          {visible.map((job) => {
            const meta = STATUS_META[job.status] ?? STATUS_META.pending;
            const Icon = meta.icon;
            const active = job.status === "pending" || job.status === "running";
            return (
              <div key={job.id} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${meta.className.split(" ")[0]} ${job.status === "running" ? "animate-spin" : ""}`} />
                    <span className="font-medium">{TYPE_LABEL[job.job_type] ?? job.job_type}</span>
                    <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                    {job.attempts > 1 && (
                      <Badge variant="outline" className="text-xs">
                        tentativa {job.attempts}/{job.max_attempts}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {active && (
                      <Button size="sm" variant="ghost" disabled={busy === job.id} onClick={() => setPendingCancel(job)}>
                        <Ban className="h-4 w-4 mr-1" /> Cancelar
                      </Button>
                    )}
                    {(job.status === "failed" || job.status === "cancelled") && (
                      <Button size="sm" variant="ghost" disabled={busy === job.id} onClick={() => void handleRetry(job)}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Reprocessar
                      </Button>
                    )}
                  </div>
                </div>

                {job.status === "running" && <Progress value={undefined} className="h-1" />}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <span>Criada: {new Date(job.created_at).toLocaleString("pt-BR")}</span>
                  <span>Início: {job.started_at ? new Date(job.started_at).toLocaleTimeString("pt-BR") : "—"}</span>
                  <span>Fim: {job.finished_at ? new Date(job.finished_at).toLocaleTimeString("pt-BR") : "—"}</span>
                  <span>Duração: {duration(job)}</span>
                </div>

                {job.last_error && <p className="text-xs text-destructive break-words">⚠️ {job.last_error}</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingCancel} onOpenChange={(o) => !o && setPendingCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCancel?.status === "running"
                ? "A tarefa já está em execução — o resultado em andamento será descartado."
                : "A tarefa sairá da fila e não será processada."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancel()}>Cancelar tarefa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
