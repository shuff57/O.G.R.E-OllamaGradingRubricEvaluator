import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../ai-retry.js';

describe('withRetry', () => {
  it('should return result on first successful call (no retries)', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { baseDelay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on 503 then return result on success', async () => {
    const error503 = new Error('Service Unavailable');
    error503.status = 503;

    const fn = vi.fn()
      .mockRejectedValueOnce(error503)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { baseDelay: 10 });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should fail immediately on 401 without retrying', async () => {
    const error401 = new Error('Unauthorized');
    error401.status = 401;

    const fn = vi.fn().mockRejectedValue(error401);

    await expect(withRetry(fn, { baseDelay: 10 })).rejects.toThrow('Unauthorized');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should fail immediately on 400 without retrying', async () => {
    const error400 = new Error('Bad Request');
    error400.status = 400;

    const fn = vi.fn().mockRejectedValue(error400);

    await expect(withRetry(fn, { baseDelay: 10 })).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw last error after exhausting all retries', async () => {
    const error500 = new Error('Internal Server Error');
    error500.status = 500;

    const fn = vi.fn().mockRejectedValue(error500);

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toThrow('Internal Server Error');
    // 1 initial + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback with correct attempt number', async () => {
    const error502 = new Error('Bad Gateway');
    error502.status = 502;

    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(error502)
      .mockRejectedValueOnce(error502)
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { maxRetries: 3, baseDelay: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, error502);
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, error502);
  });

  it('should retry on network errors (no status code)', async () => {
    const networkError = new Error('fetch failed');

    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, { baseDelay: 10 });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use default maxRetries of 3', async () => {
    const error = new Error('server error');
    error.status = 500;

    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { baseDelay: 10 })).rejects.toThrow();
    // 1 initial + 3 retries = 4 calls
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
