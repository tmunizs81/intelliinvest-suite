import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type JobStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface QueueJob {
  id: string;
  job_type: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  payload: Record<string, unknown> | null;
  result: unknown;
  last_error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  cancellable?: boolean;
}

const FUNCTION = "jobs-status";

async function callJobsApi<T>(
  init: { method: "GET" | "POST"; query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("sessão expirada");

  const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION}`;
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";

  const resp = await fetch(base + qs, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((json as any)?.error ?? `HTTP ${resp.status}`);
  return json as T;
}

/**
 * Acompanha a fila de tarefas assíncronas do usuário.
 * Faz polling curto apenas enquanto houver tarefa ativa (economiza requests).
 */
export function useJobQueue(autoRefresh = true) {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await callJobsApi<{ jobs: QueueJob[]; summary: Record<string, number> }>({
        method: "GET",
        query: { limit: "100" },
      });
      setJobs(data.jobs ?? []);
      setSummary(data.summary ?? {});
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "falha ao carregar tarefas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const hasActive = jobs.some((j) => j.status === "pending" || j.status === "running");

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = hasActive ? 4000 : 30000;
    timer.current = window.setInterval(() => void refresh(), interval);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [autoRefresh, hasActive, refresh]);

  const cancel = useCallback(async (id: string) => {
    const res = await callJobsApi<{ ok: boolean; reason?: string; note?: string }>({
      method: "POST",
      body: { action: "cancel", id },
    });
    await refresh();
    return res;
  }, [refresh]);

  const retry = useCallback(async (id: string) => {
    const res = await callJobsApi<{ ok: boolean; id?: string }>({
      method: "POST",
      body: { action: "retry", id },
    });
    await refresh();
    return res;
  }, [refresh]);

  return { jobs, summary, loading, error, hasActive, refresh, cancel, retry };
}
