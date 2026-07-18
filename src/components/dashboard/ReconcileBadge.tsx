/**
 * ReconcileBadge — surfaces pending/abandoned snapshot failures and lets the
 * user trigger the server-side reconcile-snapshots edge function on demand.
 * Silent when there are no pending failures.
 */
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useSnapshotFailures } from "@/hooks/useSnapshotFailures";
import { toast } from "sonner";

export default function ReconcileBadge() {
  const { pending, abandoned, reconciling, reconcileNow } = useSnapshotFailures();
  const total = pending.length + abandoned.length;
  if (total === 0) return null;

  const critical = abandoned.length > 0;

  const handle = async () => {
    try {
      await reconcileNow();
      toast.success("Reconciliação disparada");
    } catch (e) {
      toast.error(`Falha na reconciliação: ${(e as Error).message}`);
    }
  };

  const last = pending[0] ?? abandoned[0];
  const title = `${total} snapshot(s) pendentes • último motivo: ${last?.reason ?? "—"} • tentativas: ${last?.attempts ?? 0}`;

  return (
    <button
      onClick={handle}
      disabled={reconciling}
      title={title}
      className={`h-8 inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-all ${
        critical
          ? "border-loss/60 bg-loss/10 text-loss"
          : "border-warning/40 bg-warning/5 text-warning"
      }`}
    >
      {reconciling ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">
        {reconciling ? "Reconciliando..." : `${total} snapshot${total > 1 ? "s" : ""} pendente${total > 1 ? "s" : ""}`}
      </span>
    </button>
  );
}
