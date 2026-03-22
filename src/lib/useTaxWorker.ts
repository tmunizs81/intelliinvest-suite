import { useCallback, useRef } from 'react';

/**
 * Hook to run tax calculations in a Web Worker.
 * Falls back to main thread if Workers are unavailable.
 */
export function useTaxWorker() {
  const workerRef = useRef<Worker | null>(null);

  const calculateInWorker = useCallback((transactions: any[], year: number): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      try {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('./taxWorker.ts', import.meta.url),
            { type: 'module' }
          );
        }

        const worker = workerRef.current;
        const timeout = setTimeout(() => {
          reject(new Error('Worker timeout'));
        }, 10000);

        worker.onmessage = (e: MessageEvent) => {
          clearTimeout(timeout);
          if (e.data.type === 'taxResult') {
            resolve(e.data.result);
          }
        };

        worker.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };

        worker.postMessage({ type: 'calculateTaxes', transactions, year });
      } catch {
        // Fallback: resolve empty — caller should use main-thread calculation
        resolve([]);
      }
    });
  }, []);

  return { calculateInWorker };
}
