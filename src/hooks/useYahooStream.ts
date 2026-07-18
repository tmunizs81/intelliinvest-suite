import { useEffect, useRef, useState } from "react";

export interface StreamQuote {
  price: number;
  changePercent: number;
  time?: number;
}

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

/**
 * Assina cotações em tempo real via WebSocket relay do Yahoo (edge fn yahoo-stream).
 * Retorna mapa ticker → { price, changePercent } atualizado em tempo real.
 * Reconecta automaticamente em caso de queda.
 */
export function useYahooStream(tickers: string[]) {
  const [quotes, setQuotes] = useState<Record<string, StreamQuote>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = tickers.slice().sort().join(",");

  useEffect(() => {
    if (!PROJECT_ID || tickers.length === 0) return;

    let stopped = false;
    const list = tickers.slice(0, 50);

    const connect = () => {
      if (stopped) return;
      const url = `wss://${PROJECT_ID}.functions.supabase.co/yahoo-stream`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ subscribe: list }));
      };
      ws.onmessage = (ev) => {
        try {
          const q = JSON.parse(ev.data);
          if (!q?.id) return;
          setQuotes((prev) => ({
            ...prev,
            [q.id]: { price: q.price, changePercent: q.changePercent ?? 0, time: q.time },
          }));
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retryRef.current = setTimeout(connect, 3000);
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    };

    connect();
    return () => {
      stopped = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      try { wsRef.current?.close(); } catch { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { quotes, connected };
}
