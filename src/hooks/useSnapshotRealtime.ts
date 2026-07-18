/**
 * useSnapshotRealtime — Escuta INSERT/UPDATE em portfolio_snapshots do usuário
 * atual e dispara um callback (ex.: recarregar snapshots + invalidar bootstrap).
 * Complementa o worker client-side: mudanças vindas do cron server-side
 * também propagam para a UI instantaneamente.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { clearCache } from "@/lib/persistentCache";

export function useSnapshotRealtime(onChange: () => void) {
  const { user } = useAuth();
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`portfolio_snapshots:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "portfolio_snapshots",
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          await clearCache(`dashboard_bootstrap:${user.id}`);
          cbRef.current();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}
