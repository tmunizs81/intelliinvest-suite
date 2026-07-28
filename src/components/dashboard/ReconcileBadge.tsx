/**
 * ReconcileBadge — pending/abandoned snapshot failures with popover:
 * Reconcile now OR dismiss (mark resolved). Silent when nothing pending.
 */
import { useState, useRef, useEffect } from "react";
import { AlertTriangle, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { useSnapshotFailures } from "@/hooks/useSnapshotFailures";
import { toast } from "sonner";

export default function ReconcileBadge() {
  const { pending, abandoned, reconciling, reconcileNow, dismissAll } = useSnapshotFailures();
  const [open, setOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const total = pending.length + abandoned.length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (total === 0) return null;
  const critical = abandoned.length > 0;
  const all = [...pending, ...abandoned];

  const handleReconcile = async () => {
    try {
      await reconcileNow();
      toast.success("Reconciliação disparada");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      await dismissAll();
      toast.success("Pendências dispensadas");
      setOpen(false);
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`h-8 inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all ${
          critical ? "border-loss/60 bg-loss/10 text-loss" : "border-warning/40 bg-warning/5 text-warning"
        }`}
      >
        {reconciling
          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          : <AlertTriangle className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">
          {total} snapshot{total > 1 ? "s" : ""} pendente{total > 1 ? "s" : ""}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg p-3 z-50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Snapshots com falha</p>
            <button onClick={() => setOpen(false)} className="p-0.5 hover:bg-accent rounded">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-1.5 mb-3">
            {all.slice(0, 8).map(f => (
              <li key={f.id} className="text-xs border border-border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-mono">{f.snapshot_date}</span>
                  <span className={f.status === "abandoned" ? "text-loss" : "text-warning"}>
                    {f.status} • {f.attempts}x
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 break-all">{f.reason}</div>
                {f.last_error && <div className="text-muted-foreground italic">{f.last_error}</div>}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={handleReconcile}
              disabled={reconciling}
              className="flex-1 text-xs px-3 py-1.5 rounded border border-border hover:bg-accent inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${reconciling ? "animate-spin" : ""}`} /> Reconciliar
            </button>
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="flex-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <CheckCircle2 className="h-3 w-3" /> Dispensar
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Se um ticker não tem cotação disponível, dispensar remove a pendência do dia.
          </p>
        </div>
      )}
    </div>
  );
}
