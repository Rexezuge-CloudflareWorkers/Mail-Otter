import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListFeatureApps, mockGetById, mockGetAccessToken, mockCreateSessionEnv } = vi.hoisted(() => ({
  mockListFeatureApps: vi.fn(),
  mockGetById: vi.fn(),
  mockGetAccessToken: vi.fn(),
  mockCreateSessionEnv: vi.fn((env: unknown) => env),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return { listApplicationIdsWithFeatureEnabled: mockListFeatureApps, getById: mockGetById };
  }),
  BackgroundTaskRunDAO: vi.fn(function () {
    return {
      startRun: vi.fn(async () => 'run-1'),
      succeedRun: vi.fn(async () => undefined),
      failRun: vi.fn(async () => undefined),
      skipRun: vi.fn(async () => undefined),
    };
  }),
}));

vi.mock('@mail-otter/backend-data/utils', () => ({
  createD1SessionEnv: (env: unknown) => mockCreateSessionEnv(env),
}));

vi.mock('@mail-otter/backend-services/oauth2', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
}));

import { BaseDriveSyncTask } from '../../apps/background/src/scheduled/BaseDriveSyncTask';

class TestDriveSyncTask extends BaseDriveSyncTask<never> {
  public ingestCalls: string[] = [];

  protected config() {
    return {
      taskType: 'drive_sync',
      featureFlag: 'drive_sync_enabled',
      expectedProviderId: 'google-gmail',
      unsupportedProviderMessage: 'Unsupported provider',
      noun: 'drive',
    };
  }

  protected async ingestForApplication(_env: never, application: { applicationId: string }, _token: string) {
    this.ingestCalls.push(application.applicationId);
    return { indexed: 2, skipped: 1, failed: 0 };
  }
}

function makeEnv() {
  return {
    DB: {},
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
  } as never;
}

describe('BaseDriveSyncTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty summary when no applications have the feature', async () => {
    mockListFeatureApps.mockResolvedValue([]);
    const task = new TestDriveSyncTask();
    const result = await (task as unknown as { handleScheduledTask(e: never, env: never, c: never): Promise<unknown> }).handleScheduledTask(
      {} as never,
      makeEnv(),
      {} as never,
    );
    expect(result).toEqual({ itemsProcessed: 0, itemsFailed: 0 });
  });

  it('syncs connected matching applications and skips the rest', async () => {
    mockListFeatureApps.mockResolvedValue(['a-1', 'a-2', 'a-3']);
    mockGetById.mockImplementation(async (id: string) => {
      if (id === 'a-1') return { applicationId: 'a-1', status: 'connected', providerId: 'google-gmail' };
      if (id === 'a-2') return { applicationId: 'a-2', status: 'error', providerId: 'google-gmail' };
      return { applicationId: 'a-3', status: 'connected', providerId: 'microsoft-outlook' };
    });
    mockGetAccessToken.mockResolvedValue('tok');
    const task = new TestDriveSyncTask();
    const result = (await (
      task as unknown as { handleScheduledTask(e: never, env: never, c: never): Promise<{ itemsProcessed: number; itemsFailed: number; summary: string }> }
    ).handleScheduledTask({}, makeEnv(), {} as never));
    expect(task.ingestCalls).toEqual(['a-1']);
    expect(result.itemsProcessed).toBe(1);
    expect(result.itemsFailed).toBe(0);
    expect(result.summary).toContain('1 of 3');
  });

  it('records failures without aborting the batch', async () => {
    mockListFeatureApps.mockResolvedValue(['a-1']);
    mockGetById.mockResolvedValue({ applicationId: 'a-1', status: 'connected', providerId: 'google-gmail' });
    mockGetAccessToken.mockRejectedValue(new Error('token expired'));
    const task = new TestDriveSyncTask();
    const result = (await (
      task as unknown as { handleScheduledTask(e: never, env: never, c: never): Promise<{ itemsProcessed: number; itemsFailed: number }> }
    ).handleScheduledTask({}, makeEnv(), {} as never));
    expect(result.itemsProcessed).toBe(0);
    expect(result.itemsFailed).toBe(1);
  });
});
