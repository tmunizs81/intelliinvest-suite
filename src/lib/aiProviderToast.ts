import { toast } from "@/hooks/use-toast";

/**
 * Checks if the AI response used the fallback provider (Lovable AI).
 * Shows a subtle toast when DeepSeek is unavailable and Lovable AI was used.
 */
export function checkAIProviderFallback(data: any) {
  const provider = data?._provider;
  if (provider === "lovable") {
    toast({
      title: "IA Secundária",
      description: "DeepSeek indisponível, usando Lovable AI como fallback.",
      duration: 3000,
    });
  }
}
