import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OndoGMToken {
  symbol: string;
  name: string;
  underlying_ticker: string;
  logo_uri: string | null;
}

export function useOndoGMTokens() {
  return useQuery({
    queryKey: ["ondo-gm-tokens"],
    queryFn: async (): Promise<OndoGMToken[]> => {
      const { data, error } = await supabase
        .from("ondo_gm_tokens")
        .select("symbol, name, underlying_ticker, logo_uri")
        .order("symbol");

      if (error) throw error;
      return (data as OndoGMToken[]) || [];
    },
    staleTime: 1000 * 60 * 60, // 1 hour cache
    gcTime: 1000 * 60 * 60 * 24, // 24h garbage collection
  });
}

/** Check if a ticker is an Ondo GM token and return the underlying */
export function getOndoGMUnderlyingFromList(
  ticker: string,
  tokens: OndoGMToken[]
): string | null {
  const found = tokens.find(
    (t) => t.symbol === ticker || t.symbol.toUpperCase() === ticker.toUpperCase()
  );
  return found ? found.underlying_ticker : null;
}
