/**
 * Sequential AI request queue to prevent simultaneous calls hitting rate limits.
 * All AI panel requests go through this queue so they execute one at a time
 * with a small delay between them.
 */

type QueueItem = {
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const queue: QueueItem[] = [];
let running = false;
const DELAY_BETWEEN_MS = 1500;

async function processQueue() {
  if (running) return;
  running = true;

  while (queue.length > 0) {
    const item = queue.shift()!;
    try {
      await item.fn();
      item.resolve();
    } catch (err) {
      item.reject(err);
    }
    if (queue.length > 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
    }
  }

  running = false;
}

/**
 * Enqueue an async function to run sequentially.
 * Returns a promise that resolves when the function completes.
 */
export function enqueueAIRequest(fn: () => Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
}
