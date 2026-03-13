import { toast } from "@/hooks/use-toast";

let lastToastTime = 0;
const TOAST_COOLDOWN_MS = 30000;

/**
 * Checks if the AI response used a fallback provider
 * and shows a diagnostic toast to the user (with cooldown).
 */
export function checkAIProviderFallback(data: any) {
  if (!data || typeof data !== "object") return;
  // With Lovable AI Gateway, no fallback toast needed
  // Keep function signature for compatibility
}
  if (!data || typeof data !== "object") return;
  const provider = data._provider;
  if (provider === "groq" || provider === "gemini") {
    const now = Date.now();
    if (now - lastToastTime > TOAST_COOLDOWN_MS) {
      lastToastTime = now;
      const label = provider === "groq" ? "Groq" : "Gemini (secundário)";
      toast({
        title: "⚡ IA alternativa ativa",
        description: `Provedor principal indisponível. Usando ${label}.`,
        duration: 5000,
      });
    }
  }
}
