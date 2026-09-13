import { describe, expect, it, vi } from 'vitest';
import { AiService } from '@mail-otter/backend-services/ai';
import { AppConfiguration } from '@mail-otter/backend-runtime/config';

describe('AiService', () => {
  it('embeds via Workers AI and validates the vector', async () => {
    const svc = new AiService({ db: {} as never });
    const ai = { run: vi.fn().mockResolvedValue({ data: [[1, 2, 3]] }) } as unknown as Ai;
    await expect(svc.embed(ai, 'model', 'hello')).resolves.toEqual([1, 2, 3]);
  });

  it('throws when Workers AI returns no vector', async () => {
    const svc = new AiService({ db: {} as never });
    const ai = { run: vi.fn().mockResolvedValue({ data: [] }) } as unknown as Ai;
    await expect(svc.embed(ai, 'model', 'hello')).rejects.toThrow('embedding vector');
  });

  it('reads string metadata and truncates', () => {
    const svc = new AiService({ db: {} as never });
    expect(svc.getStringMetadata({ title: 'T' } as never, 'title')).toBe('T');
    expect(svc.getStringMetadata({ title: 42 } as never, 'title')).toBeUndefined();
    expect(svc.truncateMetadata('abcdef', 3)).toBe('abc');
  });
});

describe('AppConfiguration', () => {
  it('parses values with defaults and trims base URLs', () => {
    const config = AppConfiguration.fromEnv({ MAX_APPLICATIONS_PER_USER: '5', PUBLIC_BASE_URL: 'https://x///' });
    expect(config.getMaxApplicationsPerUser()).toBe(5);
    expect(config.getPublicBaseUrl()).toBe('https://x');
    expect(config.getSummaryModel()).toContain('@cf/');
  });

  it('falls back to defaults for empty env', () => {
    const config = AppConfiguration.fromEnv({});
    expect(config.getMaxApplicationsPerUser()).toBeGreaterThan(0);
    expect(config.getChatMaxHistoryMessages()).toBeGreaterThan(0);
    expect(config.getActionRetentionDays()).toBeGreaterThan(0);
  });
});
