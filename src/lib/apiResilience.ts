/**
 * Retry with exponential backoff + circuit breaker + request deduplication
 */

// --- Retry with Exponential Backoff ---
interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;    // ms
  maxDelay?: number;     // ms
  retryOn?: (error: any) => boolean;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  retryOn: (err) => {
    if (err?.status === 429 || err?.status === 503 || err?.status === 502) return true;
    if (err?.message?.includes('fetch') || err?.message?.includes('network')) return true;
    return false;
  },
};

export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === opts.maxRetries || !opts.retryOn(err)) throw err;

      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 500,
        opts.maxDelay
      );
      console.warn(`[Retry] Attempt ${attempt + 1}/${opts.maxRetries}, waiting ${Math.round(delay)}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// --- Circuit Breaker ---
interface CircuitState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuits = new Map<string, CircuitState>();

const CIRCUIT_THRESHOLD = 5;      // failures to open
const CIRCUIT_RESET_MS = 60_000;  // 1 min cooldown

export function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  let circuit = circuits.get(key);
  if (!circuit) {
    circuit = { failures: 0, lastFailure: 0, state: 'closed' };
    circuits.set(key, circuit);
  }

  // Check if circuit should transition from open to half-open
  if (circuit.state === 'open') {
    if (Date.now() - circuit.lastFailure > CIRCUIT_RESET_MS) {
      circuit.state = 'half-open';
    } else {
      return Promise.reject(new Error(`Circuit breaker OPEN for "${key}". Aguarde ${Math.ceil((CIRCUIT_RESET_MS - (Date.now() - circuit.lastFailure)) / 1000)}s.`));
    }
  }

  return fn().then(
    (result) => {
      // Success: reset circuit
      circuit!.failures = 0;
      circuit!.state = 'closed';
      return result;
    },
    (err) => {
      circuit!.failures++;
      circuit!.lastFailure = Date.now();
      if (circuit!.failures >= CIRCUIT_THRESHOLD) {
        circuit!.state = 'open';
        console.error(`[CircuitBreaker] "${key}" OPENED after ${circuit!.failures} failures`);
      }
      throw err;
    }
  );
}

export function getCircuitState(key: string): CircuitState['state'] {
  return circuits.get(key)?.state || 'closed';
}

export function resetCircuit(key: string) {
  circuits.delete(key);
}

// --- Request Deduplication ---
const inflightRequests = new Map<string, Promise<any>>();

export function deduplicateRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    console.debug(`[Dedup] Reusing inflight request for "${key}"`);
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inflightRequests.delete(key);
  });

  inflightRequests.set(key, promise);
  return promise;
}

// --- Client-side Rate Limiter ---
interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

const rateLimiters = new Map<string, RateLimitState>();

interface RateLimitOptions {
  maxTokens: number;       // max calls in window
  refillRate: number;      // tokens per second
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  maxTokens: 10,
  refillRate: 0.5,  // 1 token every 2 seconds
};

export function checkRateLimit(
  key: string,
  options?: Partial<RateLimitOptions>
): { allowed: boolean; retryAfterMs: number } {
  const opts = { ...DEFAULT_RATE_LIMIT, ...options };
  const now = Date.now();

  let state = rateLimiters.get(key);
  if (!state) {
    state = { tokens: opts.maxTokens, lastRefill: now };
    rateLimiters.set(key, state);
  }

  // Refill tokens
  const elapsed = (now - state.lastRefill) / 1000;
  state.tokens = Math.min(opts.maxTokens, state.tokens + elapsed * opts.refillRate);
  state.lastRefill = now;

  if (state.tokens >= 1) {
    state.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  const retryAfterMs = Math.ceil((1 - state.tokens) / opts.refillRate * 1000);
  return { allowed: false, retryAfterMs };
}

export function resetRateLimit(key: string) {
  rateLimiters.delete(key);
}
