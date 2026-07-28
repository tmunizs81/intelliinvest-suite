import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SnapshotFailure {
  id: string;
  snapshot_date: string;
  reason: string;
  attempts: number;
  status: "pending" | "resolved" | "abandoned";
  next_retry_at: string;
  last_error: string | null;
  updated_at: string;
}

export function useSnapshotFailures() {
  const { user } = useAuth();
  const [failures, setFailures] = useState<SnapshotFailure[]>([]);
  const [reconciling, setReconciling] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await (supabase as any)
      .from("snapshot_refresh_failures")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["pending", "abandoned"])
      .order("updated_at", { ascending: false })
      .limit(20);
    setFailures((data ?? []) as SnapshotFailure[]);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`snap-failures-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snapshot_refresh_failures", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const reconcileNow = useCallback(async () => {
    setReconciling(true);
    try {
      await supabase.functions.invoke("reconcile-snapshots", { body: {} });
      await load();
    } finally {
      setReconciling(false);
    }
  }, [load]);

  const dismissAll = useCallback(async () => {
    if (!user) return;
    // Mark all pending/abandoned rows for today (and older) as resolved.
    await (supabase as any)
      .from("snapshot_refresh_failures")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .in("status", ["pending", "abandoned"]);
    await load();
  }, [user, load]);

  const pending = failures.filter((f) => f.status === "pending");
  const abandoned = failures.filter((f) => f.status === "abandoned");

  return { failures, pending, abandoned, reconciling, reconcileNow, dismissAll, reload: load };
}
