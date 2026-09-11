import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiUsageUtil } from '../../packages/backend-services/src/email/AiUsageUtil';

describe('AiUsageUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUtcUsageDate', () => {
    it('returns today in YYYY-MM-DD format', () => {
      expect(AiUsageUtil.getCurrentUtcUsageDate()).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  describe('estimateTokensFromText', () => {
    it('returns 0 for empty or whitespace-only text', () => {
      expect(AiUsageUtil.estimateTokensFromText('')).toBe(0);
      expect(AiUsageUtil.estimateTokensFromText('   ')).toBe(0);
    });

    it('estimates roughly one token per four chars', () => {
      expect(AiUsageUtil.estimateTokensFromText('abcd')).toBe(1);
      expect(AiUsageUtil.estimateTokensFromText('abcde')).toBe(2);
      expect(AiUsageUtil.estimateTokensFromText('a'.repeat(400))).toBe(100);
    });
  });

  describe('estimateTextGenerationUsageForTokenCounts', () => {
    it('computes neurons for a known model', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsageForTokenCounts('@cf/openai/gpt-oss-120b', 1_000_000, 1_000_000);
      expect(estimate).toEqual({ estimatedNeurons: 100_000, promptTokens: 1_000_000, completionTokens: 1_000_000 });
    });

    it('falls back to default rates for unknown models', () => {
      const known = AiUsageUtil.estimateTextGenerationUsageForTokenCounts('@cf/openai/gpt-oss-120b', 100, 100);
      const unknown = AiUsageUtil.estimateTextGenerationUsageForTokenCounts('@cf/unknown/model', 100, 100);
      expect(unknown).toEqual(known);
    });

    it('normalizes negative and fractional token counts', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsageForTokenCounts('@cf/openai/gpt-oss-120b', -5, 1.2);
      expect(estimate.promptTokens).toBe(0);
      expect(estimate.completionTokens).toBe(2);
    });

    it('uses input rate for output when model has no output rate', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsageForTokenCounts('@cf/baai/bge-m3', 1_000_000, 1_000_000);
      expect(estimate.estimatedNeurons).toBe(2150);
    });
  });

  describe('estimateTextGenerationUsage', () => {
    it('uses usage token counts when provided', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsage(
        '@cf/openai/gpt-oss-120b',
        { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        'fallback input',
        'fallback output',
      );
      expect(estimate.promptTokens).toBe(100);
      expect(estimate.completionTokens).toBe(50);
      expect(estimate.estimatedNeurons).toBeGreaterThan(0);
    });

    it('takes the max of explicit completion tokens and total-derived tokens', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsage(
        '@cf/openai/gpt-oss-120b',
        { promptTokens: 100, completionTokens: 10, totalTokens: 200 },
        '',
        '',
      );
      expect(estimate.completionTokens).toBe(100);
    });

    it('falls back to text estimates when usage is missing', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsage('@cf/openai/gpt-oss-120b', undefined, 'abcdefgh', 'xy');
      expect(estimate.promptTokens).toBe(2);
      expect(estimate.completionTokens).toBe(1);
    });

    it('ignores invalid usage values and falls back to text', () => {
      const estimate = AiUsageUtil.estimateTextGenerationUsage(
        '@cf/openai/gpt-oss-120b',
        { promptTokens: -3, completionTokens: Number.NaN, totalTokens: -1 },
        'abcd',
        'efgh',
      );
      expect(estimate.promptTokens).toBe(1);
      expect(estimate.completionTokens).toBe(1);
    });
  });

  describe('estimateEmbeddingUsage', () => {
    it('estimates embedding neurons from text length', () => {
      const estimate = AiUsageUtil.estimateEmbeddingUsage('@cf/baai/bge-m3', 'a'.repeat(400));
      expect(estimate.embeddingTokens).toBe(100);
      expect(estimate.estimatedNeurons).toBe(1);
    });

    it('returns zero for empty text', () => {
      expect(AiUsageUtil.estimateEmbeddingUsage('@cf/baai/bge-m3', '')).toEqual({
        estimatedNeurons: 0,
        embeddingTokens: 0,
      });
    });

    it('falls back to default rates for unknown embedding models', () => {
      const known = AiUsageUtil.estimateEmbeddingUsage('@cf/baai/bge-m3', 'hello world, this is a test');
      const unknown = AiUsageUtil.estimateEmbeddingUsage('@cf/unknown/embed', 'hello world, this is a test');
      expect(unknown).toEqual(known);
    });
  });
});
