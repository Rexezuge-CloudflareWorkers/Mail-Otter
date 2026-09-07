import { describe, expect, it, vi } from 'vitest';
import { computeDateCutoffIso, computeUnixCutoffSeconds, pruneInBatches } from '../../packages/backend-data/src/utils/RepositoryHelper';

describe('RepositoryHelper', () => {
  describe('computeUnixCutoffSeconds', () => {
    it('subtracts retention days in seconds', () => {
      expect(computeUnixCutoffSeconds(30, 1_778_200_000_000)).toBe(1_778_200_000 - 30 * 86_400);
    });

    it('returns now for zero retention', () => {
      expect(computeUnixCutoffSeconds(0, 1_000_000_000)).toBe(1_000_000);
    });
  });

  describe('computeDateCutoffIso', () => {
    it('returns YYYY-MM-DD string', () => {
      const cutoff = computeDateCutoffIso(90, Date.UTC(2026, 8, 7));
      expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('pruneInBatches', () => {
    it('loops until a partial batch', async () => {
      const deleteBatch = vi.fn().mockResolvedValueOnce(500).mockResolvedValueOnce(500).mockResolvedValueOnce(12);
      const total = await pruneInBatches(deleteBatch, 500);
      expect(total).toBe(1012);
      expect(deleteBatch).toHaveBeenCalledTimes(3);
    });

    it('returns zero when first batch is empty', async () => {
      const deleteBatch = vi.fn().mockResolvedValue(0);
      await expect(pruneInBatches(deleteBatch, 500)).resolves.toBe(0);
      expect(deleteBatch).toHaveBeenCalledTimes(1);
    });

    it('propagates delete errors', async () => {
      const deleteBatch = vi.fn().mockRejectedValue(new Error('boom'));
      await expect(pruneInBatches(deleteBatch, 500)).rejects.toThrow('boom');
    });
  });
});
