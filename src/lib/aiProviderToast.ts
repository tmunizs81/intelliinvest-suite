import { toast } from "@/hooks/use-toast";

/**
 * Checks if the AI response used the Groq fallback provider
 * and shows a diagnostic toast to the user.
 */
export function checkAIProviderFallback(response: Response) {
  const provider = response.headers.get("x-ai-provider");
  if (provider === "groq") {
    toast({
      title: "IA alternativa ativa",
      description: "O provedor principal está indisponível. Usando modelo alternativo (Groq).",
      variant: "default",
      duration: 5000,
    });
  }
}
