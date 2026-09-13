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
  AppConfiguration: { fromEnv: vi.fn(() => ({})) },
}));

import { AiService } from '@mail-otter/backend-services/ai';

describe('AiService usage accounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiDailyNeuronFallbackThreshold.mockReturnValue(6000);
    mocks.getCurrentUtcUsageDate.mockReturnValue('2026-09-07');
  });

  it('records embedding usage', async () => {
    mocks.estimateEmbeddingUsage.mockReturnValue({ estimatedNeurons: 5, embeddingTokens: 10 });
    mocks.incrementUsage.mockResolvedValue(undefined);
    const svc = new AiService({ db: {} as never });
    await svc.recordEmbeddingUsage('model', 'text');
    expect(mocks.estimateEmbeddingUsage).toHaveBeenCalledWith('model', 'text');
    expect(mocks.incrementUsage).toHaveBeenCalled();
  });

  it('swallows embedding usage errors', async () => {
    mocks.estimateEmbeddingUsage.mockReturnValue({ estimatedNeurons: 1, embeddingTokens: 1 });
    mocks.incrementUsage.mockRejectedValue(new Error('db down'));
    const svc = new AiService({ db: {} as never });
    await expect(svc.recordEmbeddingUsage('model', 'text')).resolves.toBeUndefined();
  });

  it('records text generation usage and returns the estimate', async () => {
    mocks.estimateTextGenerationUsage.mockReturnValue({ estimatedNeurons: 7, promptTokens: 3, completionTokens: 4 });
    mocks.incrementUsage.mockResolvedValue(undefined);
    const svc = new AiService({ db: {} as never });
    const estimate = await svc.recordTextGenerationUsage('model', undefined, 'in', 'out');
    expect(estimate).toEqual({ estimatedNeurons: 7, promptTokens: 3, completionTokens: 4 });
  });

  it('returns undefined when text usage accounting fails', async () => {
    mocks.estimateTextGenerationUsage.mockReturnValue({ estimatedNeurons: 1, promptTokens: 1, completionTokens: 1 });
    mocks.incrementUsage.mockRejectedValue(new Error('db down'));
    const svc = new AiService({ db: {} as never });
    await expect(svc.recordTextGenerationUsage('m', undefined, 'i', 'o')).resolves.toBeUndefined();
  });

  it('skips when daily threshold reached, runs when below, disables at zero', async () => {
    const svc = new AiService({ db: {} as never });
    mocks.getEstimatedNeuronsForDate.mockResolvedValue(9000);
    await expect(svc.shouldSkipForDailyUsage({ DB: {} as never })).resolves.toBe(true);
    mocks.getEstimatedNeuronsForDate.mockResolvedValue(10);
    await expect(svc.shouldSkipForDailyUsage({ DB: {} as never })).resolves.toBe(false);
    mocks.getAiDailyNeuronFallbackThreshold.mockReturnValue(0);
    await expect(svc.shouldSkipForDailyUsage({ DB: {} as never })).resolves.toBe(false);
  });

  it('returns false when usage read fails', async () => {
    mocks.getAiDailyNeuronFallbackThreshold.mockReturnValue(6000);
    mocks.getEstimatedNeuronsForDate.mockRejectedValue(new Error('db down'));
    const svc = new AiService({ db: {} as never });
    await expect(svc.shouldSkipForDailyUsage({ DB: {} as never })).resolves.toBe(false);
  });

  it('fingerprints values', async () => {
    const svc = new AiService({ db: {} as never });
    const fp = await svc.fingerprint('secret', 'label', 'value');
    expect(typeof fp).toBe('string');
    expect(fp.length).toBeGreaterThan(0);
  });
});
