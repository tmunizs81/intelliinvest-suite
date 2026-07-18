/**
 * Cliente do ai-router — endpoint único de IA.
 * Substitui invocações diretas de ai-insights, ai-scoring, etc.
 *
 * Uso:
 *   const data = await aiRouter("insights", { portfolio });
 *   const data = await aiRouter("scoring", { portfolio });
 */
import { supabase } from "@/integrations/supabase/client";

export type AITask = "insights" | "scoring";

export async function aiRouter<T = unknown>(
  task: AITask,
  payload: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-router", {
    body: { task, payload },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}
