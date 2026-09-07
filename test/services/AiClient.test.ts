import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  estimateEmbeddingUsage: vi.fn(),
  estimateTextGenerationUsage: vi.fn(),
  getCurrentUtcUsageDate: vi.fn(() => '2026-09-07'),
  getEstimatedNeuronsForDate: vi.fn(),
  incrementUsage: vi.fn(),
  getAiDailyNeuronFallbackThreshold: vi.fn(() => 6000),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  AiDailyUsageDAO: class {
    getEstimatedNeuronsForDate = mocks.getEstimatedNeuronsForDate;
    incrementUsage = mocks.incrementUsage;
  },
}));

vi.mock('@mail-otter/backend-services/email/AiUsageUtil', () => ({
  AiUsageUtil: {
    estimateEmbeddingUsage: mocks.estimateEmbeddingUsage,
    estimateTextGenerationUsage: mocks.estimateTextGenerationUsage,
    getCurrentUtcUsageDate: mocks.getCurrentUtcUsageDate,
  },
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    getAiDailyNeuronFallbackThreshold: mocks.getAiDailyNeuronFallbackThreshold,
  },
}));

import { AiClient } from '../../packages/backend-services/src/ai/AiClient';

function createAi(runImpl: (model: string, input: unknown) => Promise<unknown>): Ai {
  return { run: vi.fn(runImpl) } as unknown as Ai;
}

describe('AiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiDailyNeuronFallbackThreshold.mockReturnValue(6000);
    mocks.getCurrentUtcUsageDate.mockReturnValue('2026-09-07');
  });

  describe('embed', () => {
    it('returns nested embedding vector', async () => {
      const ai = createAi(async () => ({ data: [[0.1, 0.2]] }));
      await expect(AiClient.embed(ai, '@cf/baai/bge-m3', 'hello')).resolves.toEqual([0.1, 0.2]);
    });

    it('returns flat embedding vector', async () => {
      const ai = createAi(async () => ({ data: [1, 2, 3] }));
      await expect(AiClient.embed(ai, 'model', 'hi')).resolves.toEqual([1, 2, 3]);
    });

    it('throws when AI returns no vector', async () => {
      const ai = createAi(async () => ({ data: ['oops'] }));
      await expect(AiClient.embed(ai, 'model', 'hi')).rejects.toThrow('did not return an embedding vector');
    });
  });

  describe('recordEmbeddingUsage', () => {
    it('estimates and increments usage', async () => {
      mocks.estimateEmbeddingUsage.mockReturnValue({ estimatedNeurons: 5, embeddingTokens: 10 });
      mocks.incrementUsage.mockResolvedValue(undefined);
      await AiClient.recordEmbeddingUsage({} as never, 'model', 'text');
      expect(mocks.estimateEmbeddingUsage).toHaveBeenCalledWith('model', 'text');
      expect(mocks.incrementUsage).toHaveBeenCalled();
    });

    it('swallows usage errors', async () => {
      mocks.estimateEmbeddingUsage.mockReturnValue({ estimatedNeurons: 1, embeddingTokens: 1 });
      mocks.incrementUsage.mockRejectedValue(new Error('db down'));
      await expect(AiClient.recordEmbeddingUsage({} as never, 'model', 'text')).resolves.toBeUndefined();
    });
  });

  describe('shouldSkipForDailyUsage', () => {
    it('returns false when threshold disabled', async () => {
      mocks.getAiDailyNeuronFallbackThreshold.mockReturnValue(0);
      await expect(AiClient.shouldSkipForDailyUsage({ DB: {} } as never)).resolves.toBe(false);
      expect(mocks.getEstimatedNeuronsForDate).not.toHaveBeenCalled();
    });

    it('returns true when quota reached', async () => {
      mocks.getEstimatedNeuronsForDate.mockResolvedValue(7000);
      await expect(AiClient.shouldSkipForDailyUsage({ DB: {} } as never)).resolves.toBe(true);
    });

    it('returns false on read error', async () => {
      mocks.getEstimatedNeuronsForDate.mockRejectedValue(new Error('db down'));
      await expect(AiClient.shouldSkipForDailyUsage({ DB: {} } as never)).resolves.toBe(false);
    });
  });

  describe('metadata helpers', () => {
    it('getStringMetadata returns strings only', () => {
      expect(AiClient.getStringMetadata({ a: 'x', b: 1 } as never, 'a')).toBe('x');
      expect(AiClient.getStringMetadata({ b: 1 } as never, 'b')).toBeUndefined();
      expect(AiClient.getStringMetadata(undefined, 'a')).toBeUndefined();
    });

    it('truncateMetadata caps at 512 by default', () => {
      expect(AiClient.truncateMetadata('abc')).toBe('abc');
      expect(AiClient.truncateMetadata('x'.repeat(600))).toHaveLength(512);
    });

    it('fingerprint delegates to CryptoUtil', async () => {
      const fp = await AiClient.fingerprint('secret', 'label', 'value');
      expect(typeof fp).toBe('string');
      expect(fp.length).toBeGreaterThan(0);
    });
  });
});
