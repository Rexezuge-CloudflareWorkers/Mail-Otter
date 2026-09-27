import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertD1Success, executeD1WithRetry, sleep } from '../../packages/backend-data/src/utils/D1Utils';
import { DatabaseError } from '@mail-otter/backend-errors';

describe('D1Utils', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('resolves after timeout', async () => {
      vi.useFakeTimers();
      const promise = sleep(100);
      await vi.runAllTimersAsync();
      await promise;
    });
  });

  describe('assertD1Success', () => {
    it('does not throw when result.success is true', () => {
      expect(() => assertD1Success({ success: true, results: [], meta: {} as never }, 'test op')).not.toThrow();
    });

    it('throws DatabaseError when result.success is false', () => {
      expect(() =>
        assertD1Success({ success: false, error: 'UNIQUE constraint failed', results: [], meta: {} as never }, 'insert row'),
      ).toThrow(DatabaseError);
    });

    it('throws with retryable=true for retryable errors', () => {
      expect(() => assertD1Success({ success: false, error: 'database is busy', results: [], meta: {} as never }, 'update')).toThrow(
        expect.objectContaining({ retryable: true }),
      );
    });

    it('throws with retryable=false for non-retryable errors', () => {
      expect(() =>
        assertD1Success({ success: false, error: 'UNIQUE constraint failed', results: [], meta: {} as never }, 'insert'),
      ).toThrow(expect.objectContaining({ retryable: false }));
    });

    it('uses fallback error message when result.error is undefined', () => {
      expect(() => assertD1Success({ success: false, results: [], meta: {} as never }, 'fetch')).toThrow('Unknown database error');
    });
  });

  describe('executeD1WithRetry', () => {
    it('returns result immediately on first success', async () => {
      const op = vi.fn().mockResolvedValue({ success: true, results: [], meta: {} });
      const result = await executeD1WithRetry(op, 'test', { maxRetries: 3, baseDelayMs: 0 });
      expect(result.success).toBe(true);
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable Error and eventually succeeds', async () => {
      const op = vi.fn().mockRejectedValueOnce(new Error('database is busy')).mockResolvedValue({ success: true, results: [], meta: {} });
      const result = await executeD1WithRetry(op, 'test', { maxRetries: 3, baseDelayMs: 0 });
      expect(result.success).toBe(true);
      expect(op).toHaveBeenCalledTimes(2);
    });

    it('throws immediately on non-retryable Error without retrying', async () => {
      const op = vi.fn().mockRejectedValue(new Error('UNIQUE constraint failed'));
      await expect(executeD1WithRetry(op, 'insert', { maxRetries: 3, baseDelayMs: 0 })).rejects.toThrow(DatabaseError);
      expect(op).toHaveBeenCalledTimes(1);
    });

    it('exhausts all retries on persistently retryable Error', async () => {
      const op = vi.fn().mockRejectedValue(new Error('database is busy'));
      await expect(executeD1WithRetry(op, 'test', { maxRetries: 2, baseDelayMs: 0 })).rejects.toThrow(DatabaseError);
      expect(op).toHaveBeenCalledTimes(3);
    });

    it('throws on non-success D1Result for non-retryable error', async () => {
      const op = vi.fn().mockResolvedValue({ success: false, error: 'UNIQUE constraint failed', results: [], meta: {} });
      await expect(executeD1WithRetry(op, 'insert', { maxRetries: 3, baseDelayMs: 0 })).rejects.toThrow(DatabaseError);
    });

    it('retries on retryable D1Result failure then succeeds', async () => {
      const op = vi
        .fn()
        .mockResolvedValueOnce({ success: false, error: 'database is locked', results: [], meta: {} })
        .mockResolvedValue({ success: true, results: [], meta: {} });
      const result = await executeD1WithRetry(op, 'test', { maxRetries: 3, baseDelayMs: 0 });
      expect(result.success).toBe(true);
    });

    it('rethrows retryable DatabaseError after exhausting retries', async () => {
      const retryableError = new DatabaseError('network error', true);
      const op = vi.fn().mockRejectedValue(retryableError);
      await expect(executeD1WithRetry(op, 'test', { maxRetries: 1, baseDelayMs: 0 })).rejects.toThrow(DatabaseError);
      expect(op).toHaveBeenCalledTimes(2);
    });

    it('uses default retry options when none are provided', async () => {
      const op = vi.fn().mockResolvedValue({ success: true, results: [], meta: {} });
      const result = await executeD1WithRetry(op, 'test');
      expect(result.success).toBe(true);
    });
  });
});
