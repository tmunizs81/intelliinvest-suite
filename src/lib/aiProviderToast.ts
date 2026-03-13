import { toast } from "@/hooks/use-toast";

let lastToastTime = 0;
const TOAST_COOLDOWN_MS = 30000; // Show at most once every 30s

/**
 * Checks if the AI response used the Groq fallback provider
 * and shows a diagnostic toast to the user (with cooldown).
 */
export function checkAIProviderFallback(data: any) {
  if (!data || typeof data !== "object") return;
  if (data._provider === "groq") {
    const now = Date.now();
    if (now - lastToastTime > TOAST_COOLDOWN_MS) {
      lastToastTime = now;
      toast({
        title: "⚡ IA alternativa ativa",
        description: "Provedor principal indisponível. Usando modelo alternativo (Groq).",
        duration: 5000,
      });
    }
  }
}
