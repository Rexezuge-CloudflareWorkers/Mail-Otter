import { describe, expect, it, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { AiDailyUsageDAO } from '@mail-otter/backend-data/dao';
import { applyMigrations } from '../helpers/migrations';

describe('AiDailyUsageDAO', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('starts with zero estimated neurons for any date', async () => {
    const dao = new AiDailyUsageDAO(env.DB);

    const neurons: number = await dao.getEstimatedNeuronsForDate('2026-06-01');

    expect(neurons).toBe(0);
  });

  it('increments usage and reads it back', async () => {
    const dao = new AiDailyUsageDAO(env.DB);
    const usageDate: string = '2026-06-15';

    await dao.incrementUsage({ usageDate, estimatedNeurons: 100, promptTokens: 500, completionTokens: 50 });

    const usage = await dao.getByDate(usageDate);
    expect(usage).toBeDefined();
    expect(usage!.estimatedNeurons).toBe(100);
    expect(usage!.promptTokens).toBe(500);
    expect(usage!.completionTokens).toBe(50);
    expect(usage!.requestCount).toBe(1);
  });

  it('accumulates multiple increments on the same date', async () => {
    const dao = new AiDailyUsageDAO(env.DB);
    const usageDate: string = '2026-06-20';

    await dao.incrementUsage({ usageDate, estimatedNeurons: 50, promptTokens: 200, completionTokens: 20 });
    await dao.incrementUsage({ usageDate, estimatedNeurons: 30, promptTokens: 100, completionTokens: 10 });

    const usage = await dao.getByDate(usageDate);
    expect(usage!.estimatedNeurons).toBe(80);
    expect(usage!.promptTokens).toBe(300);
    expect(usage!.completionTokens).toBe(30);
    expect(usage!.requestCount).toBe(2);
  });

  it('handles zero values gracefully', async () => {
    const dao = new AiDailyUsageDAO(env.DB);

    await dao.incrementUsage({ usageDate: '2026-06-25', estimatedNeurons: 0, promptTokens: 0, completionTokens: 0 });

    const usage = await dao.getByDate('2026-06-25');
    expect(usage!.estimatedNeurons).toBe(0);
    expect(usage!.requestCount).toBe(1);
  });

  it('deletes entries older than a given date', async () => {
    const dao = new AiDailyUsageDAO(env.DB);
    await dao.incrementUsage({ usageDate: '2026-01-01', estimatedNeurons: 10 });
    await dao.incrementUsage({ usageDate: '2026-06-01', estimatedNeurons: 10 });

    const deleted: number = await dao.deleteOlderThanDate('2026-03-01');

    expect(deleted).toBeGreaterThanOrEqual(1);
    const old = await dao.getByDate('2026-01-01');
    expect(old).toBeUndefined();
    const recent = await dao.getByDate('2026-06-01');
    expect(recent).toBeDefined();
  });

  it('estimates total daily neurons across multiple increments', async () => {
    const dao = new AiDailyUsageDAO(env.DB);

    await dao.incrementUsage({ usageDate: '2026-07-01', estimatedNeurons: 200 });
    await dao.incrementUsage({ usageDate: '2026-07-01', estimatedNeurons: 300 });

    const neurons: number = await dao.getEstimatedNeuronsForDate('2026-07-01');
    expect(neurons).toBe(500);
  });
});
