import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchWithRetry,
  withCircuitBreaker,
  deduplicateRequest,
  checkRateLimit,
  resetCircuit,
  resetRateLimit,
  getCircuitState,
} from './apiResilience';

describe('fetchWithRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await fetchWithRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValue('ok');
    const result = await fetchWithRetry(fn, { baseDelay: 10, maxRetries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after max retries', async () => {
    const fn = vi.fn().mockRejectedValue({ status: 503 });
    await expect(fetchWithRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toEqual({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry on non-retryable error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('auth failed'));
    await expect(fetchWithRetry(fn, { maxRetries: 3, baseDelay: 10 })).rejects.toThrow('auth failed');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('withCircuitBreaker', () => {
  beforeEach(() => resetCircuit('test'));

  it('passes through on success', async () => {
    const result = await withCircuitBreaker('test', () => Promise.resolve('ok'));
    expect(result).toBe('ok');
    expect(getCircuitState('test')).toBe('closed');
  });

  it('opens after threshold failures', async () => {
    for (let i = 0; i < 5; i++) {
      try {
        await withCircuitBreaker('test', () => Promise.reject(new Error('fail')));
      } catch {}
    }
    expect(getCircuitState('test')).toBe('open');
    await expect(withCircuitBreaker('test', () => Promise.resolve('ok'))).rejects.toThrow(/Circuit breaker OPEN/);
  });
});

describe('deduplicateRequest', () => {
  it('returns same promise for concurrent calls', async () => {
    let callCount = 0;
    const fn = () => new Promise<string>(r => {
      callCount++;
      setTimeout(() => r('result'), 50);
    });

    const [a, b] = await Promise.all([
      deduplicateRequest('test', fn),
      deduplicateRequest('test', fn),
    ]);

    expect(a).toBe('result');
    expect(b).toBe('result');
    expect(callCount).toBe(1);
  });
});

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimit('test'));

  it('allows calls within limit', () => {
    const { allowed } = checkRateLimit('test', { maxTokens: 5, refillRate: 1 });
    expect(allowed).toBe(true);
  });

  it('blocks after tokens exhausted', () => {
    for (let i = 0; i < 3; i++) checkRateLimit('test', { maxTokens: 3, refillRate: 0.01 });
    const { allowed, retryAfterMs } = checkRateLimit('test', { maxTokens: 3, refillRate: 0.01 });
    expect(allowed).toBe(false);
    expect(retryAfterMs).toBeGreaterThan(0);
  });
});
