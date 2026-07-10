import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyDeletion, withRetry } from './d1Utils';

describe('d1Utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries failed operations with the configured backoff', async () => {
    const operation = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('sync lag'))
      .mockResolvedValueOnce('ok');

    const resultPromise = withRetry(operation, {
      maxRetries: 1,
      baseDelay: 50,
      maxDelay: 50,
    });

    expect(operation).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(50);

    await expect(resultPromise).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('aborts a retry wait without running another operation', async () => {
    const abortController = new AbortController();
    const operation = vi.fn<() => Promise<string>>()
      .mockRejectedValue(new Error('temporary failure'));

    const resultPromise = withRetry(operation, {
      maxRetries: 3,
      baseDelay: 100,
      signal: abortController.signal,
    });

    await vi.waitFor(() => {
      expect(operation).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);
    });

    abortController.abort();

    await expect(resultPromise).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('verifies deletion after a consistency delay', async () => {
    const checkFunction = vi.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const resultPromise = verifyDeletion(checkFunction, {
      maxRetries: 2,
      baseDelay: 25,
      maxDelay: 25,
    });

    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(25);

    expect(checkFunction).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(25);

    await expect(resultPromise).resolves.toBe(true);
    expect(checkFunction).toHaveBeenCalledTimes(2);
  });
});
