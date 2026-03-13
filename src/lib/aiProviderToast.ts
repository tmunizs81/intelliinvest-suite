import { toast } from "@/hooks/use-toast";

/**
 * Checks if the AI response used a fallback provider.
 * With Lovable AI Gateway, no fallback toast is needed.
 * Kept for backward compatibility.
 */
export function checkAIProviderFallback(_data: any) {
  // No-op: Lovable AI Gateway handles provider selection internally
}
