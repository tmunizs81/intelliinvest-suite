import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface AsyncJob {
  id: string;
  job_type: string;
  status: JobStatus;
  result: any;
  last_error: string | null;
  attempts: number;
  created_at: string;
  finished_at: string | null;
}

interface EnqueueOptions {
  /** Chave para deduplicar: mesma chave ativa reaproveita o job existente. */
  dedupeKey?: string;
  /** 1 (baixa) a 9 (alta). */
  priority?: number;
}

/**
 * Fila assíncrona para operações caras (ai-insights, reconciliações, relatórios).
 *
 * O job é gravado em `job_queue` pelo RPC `enqueue_job` (identidade vinda do
 * auth.uid(), concorrência controlada no servidor) e o worker executa em
 * background. Aqui só enfileiramos e acompanhamos o estado por polling curto.
 */
export function useAsyncJob(jobType: string) {
  const [job, setJob] = useState<AsyncJob | null>(null);
  const [enqueuing, setEnqueuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      const { data, error: qErr } = await supabase
        .from("job_queue")
        .select("id,job_type,status,result,last_error,attempts,created_at,finished_at")
        .eq("id", id)
        .maybeSingle();

      if (qErr) {
        setError(qErr.message);
        return;
      }
      if (!data) return;

      const next = data as unknown as AsyncJob;
      setJob(next);
      if (next.status === "done" || next.status === "failed" || next.status === "cancelled") {
        stopPolling();
      }
    },
    [stopPolling],
  );

  const enqueue = useCallback(
    async (payload: Record<string, unknown> = {}, options: EnqueueOptions = {}) => {
      setEnqueuing(true);
      setError(null);
      try {
        const { data, error: rpcErr } = await (supabase as any).rpc("enqueue_job", {
          _job_type: jobType,
          _payload: payload,
          _dedupe_key: options.dedupeKey ?? null,
          _priority: options.priority ?? 5,
        });
        if (rpcErr) throw rpcErr;

        const id = data as string;
        setJob({
          id,
          job_type: jobType,
          status: "pending",
          result: null,
          last_error: null,
          attempts: 0,
          created_at: new Date().toISOString(),
          finished_at: null,
        });

        stopPolling();
        timer.current = window.setInterval(() => poll(id), 3000);
        void poll(id);
        return id;
      } catch (e: any) {
        setError(e?.message ?? "Falha ao enfileirar tarefa");
        return null;
      } finally {
        setEnqueuing(false);
      }
    },
    [jobType, poll, stopPolling],
  );

  useEffect(() => stopPolling, [stopPolling]);

  return {
    job,
    enqueue,
    enqueuing,
    error,
    isRunning: job?.status === "pending" || job?.status === "running",
    result: job?.status === "done" ? job.result : null,
  };
}
