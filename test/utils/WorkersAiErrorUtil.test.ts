import { describe, expect, it } from 'vitest';
import { WorkersAiErrorUtil } from '@mail-otter/backend-services/email';

describe('WorkersAiErrorUtil', () => {
  describe('isDailyFreeAllocationError', () => {
    it('returns true for error matching daily free allocation text', () => {
      expect(
        WorkersAiErrorUtil.isDailyFreeAllocationError(new Error('You have used up your daily free allocation of 10,000 neurons')),
      ).toBe(true);
    });

    it('returns true for error code 4006', () => {
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError(new Error('4006'))).toBe(true);
    });

    it('returns true for error code 3036', () => {
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError(new Error('3036'))).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError(new Error('Internal server error'))).toBe(false);
    });

    it('handles non-Error objects', () => {
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError('some string')).toBe(false);
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError(null)).toBe(false);
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError(undefined)).toBe(false);
    });

    it('handles nested error objects', () => {
      const nested = { error: { code: '4006', message: 'limit' } };
      expect(WorkersAiErrorUtil.isDailyFreeAllocationError(nested)).toBe(true);
    });
  });

  describe('getDailyFreeAllocationMessage', () => {
    it('returns standard message', () => {
      expect(WorkersAiErrorUtil.getDailyFreeAllocationMessage()).toBe('Workers AI daily free allocation was exceeded.');
    });
  });
});
