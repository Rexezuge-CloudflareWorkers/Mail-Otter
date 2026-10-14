import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pruneOldRuns: vi.fn(),
  pruneOldEvents: vi.fn(),
  startRun: vi.fn(),
  succeedRun: vi.fn(),
  failRun: vi.fn(),
  skipRun: vi.fn(),
  executeScheduledActions: vi.fn(),
  googleIngest: vi.fn(),
  oneDriveIngest: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  BackgroundTaskRunDAO: class {
    startRun = mocks.startRun;
    succeedRun = mocks.succeedRun;
    failRun = mocks.failRun;
    skipRun = mocks.skipRun;
    pruneOldRuns = mocks.pruneOldRuns;
  },
  SyncedCalendarEventDAO: class {
    pruneOldEvents = mocks.pruneOldEvents;
  },
}));

vi.mock('@mail-otter/backend-services/action', () => ({
  ActionService: {
    executeScheduledActions: mocks.executeScheduledActions,
  },
}));

vi.mock('@mail-otter/backend-services/drive', () => ({
  GoogleDriveIngestionService: class {
    ingestForApplication = mocks.googleIngest;
  },
  OneDriveIngestionService: class {
    ingestForApplication = mocks.oneDriveIngest;
  },
}));

import { BackgroundTaskRunPruningTask } from '@mail-otter/background/scheduled/BackgroundTaskRunPruningTask';
import { SyncedCalendarEventPruningTask } from '@mail-otter/background/scheduled/SyncedCalendarEventPruningTask';
import { ScheduledActionExecutionTask } from '@mail-otter/background/scheduled/ScheduledActionExecutionTask';
import { GoogleDriveSyncTask } from '@mail-otter/background/scheduled/GoogleDriveSyncTask';
import { OneDriveSyncTask } from '@mail-otter/background/scheduled/OneDriveSyncTask';

function createScheduledController(): ScheduledController {
  return { scheduledTime: 1_000_000, cron: '* * * * *', noRetry: vi.fn() };
}

function createExecutionContext(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
}

function createDb(): D1Database {
  return { withSession: vi.fn().mockReturnValue({}) };
}

describe('BackgroundTaskRunPruningTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pruneOldRuns.mockResolvedValue(0);
  });

  it('prunes task runs older than the configured retention window', async () => {
    await new BackgroundTaskRunPruningTask().handle(
      createScheduledController(),
      { DB: createDb(), BACKGROUND_TASK_RUN_RETENTION_DAYS: '7' } as Env,
      createExecutionContext(),
    );

    expect(mocks.pruneOldRuns).toHaveBeenCalledOnce();
    const [cutoff, batchSize] = mocks.pruneOldRuns.mock.calls[0] as [number, number];
    expect(cutoff).toBeLessThan(Date.now() / 1000);
    expect(cutoff).toBeGreaterThan(Date.now() / 1000 - 8 * 86_400);
    expect(batchSize).toBeGreaterThan(0);
  });

  it('falls back to the default retention window when unconfigured', async () => {
    await new BackgroundTaskRunPruningTask().handle(createScheduledController(), { DB: createDb() } as Env, createExecutionContext());

    expect(mocks.pruneOldRuns).toHaveBeenCalledOnce();
  });
});

describe('SyncedCalendarEventPruningTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pruneOldEvents.mockResolvedValue(0);
  });

  it('prunes calendar events older than one day', async () => {
    await new SyncedCalendarEventPruningTask().handle(createScheduledController(), { DB: createDb() } as Env, createExecutionContext());

    expect(mocks.pruneOldEvents).toHaveBeenCalledOnce();
    const [beforeUnix, batchSize] = mocks.pruneOldEvents.mock.calls[0] as [number, number];
    expect(beforeUnix).toBeLessThan(Date.now() / 1000);
    expect(beforeUnix).toBeGreaterThan(Date.now() / 1000 - 2 * 86_400);
    expect(batchSize).toBeGreaterThan(0);
  });
});

describe('ScheduledActionExecutionTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startRun.mockResolvedValue('run-1');
    mocks.succeedRun.mockResolvedValue(undefined);
    mocks.failRun.mockResolvedValue(undefined);
  });

  it('executes due scheduled actions and records the outcome', async () => {
    mocks.executeScheduledActions.mockResolvedValue({ attempted: 2, succeeded: 1, failed: 1 });

    await new ScheduledActionExecutionTask().handle(createScheduledController(), { DB: createDb() } as Env, createExecutionContext());

    expect(mocks.executeScheduledActions).toHaveBeenCalledOnce();
    expect(mocks.startRun).toHaveBeenCalledWith({ taskType: 'scheduled_action_execution' });
    expect(mocks.succeedRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ itemsProcessed: 1, itemsFailed: 1 }));
  });

  it('records zeroed outcome when nothing is due', async () => {
    mocks.executeScheduledActions.mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });

    await new ScheduledActionExecutionTask().handle(createScheduledController(), { DB: createDb() } as Env, createExecutionContext());

    expect(mocks.succeedRun).toHaveBeenCalledWith('run-1', expect.objectContaining({ itemsProcessed: 0, itemsFailed: 0 }));
  });
});

describe('GoogleDriveSyncTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('targets the gmail provider behind the google_drive flag', () => {
    const task = new GoogleDriveSyncTask();
    const config = (
      task as unknown as {
        config(): { taskType: string; featureFlag: string; expectedProviderId: string };
      }
    ).config();

    expect(config.featureFlag).toBe('google_drive');
    expect(config.expectedProviderId).toBe('google-gmail');
  });

  it('delegates ingestion to GoogleDriveIngestionService', async () => {
    mocks.googleIngest.mockResolvedValue({ indexed: 2, skipped: 1, failed: 0 });
    const task = new GoogleDriveSyncTask();
    const application = { applicationId: 'app-1' };

    const result = await (
      task as unknown as {
        ingestForApplication(env: unknown, application: unknown, token: string): Promise<unknown>;
      }
    ).ingestForApplication({}, application, 'token-123');

    expect(mocks.googleIngest).toHaveBeenCalledWith(application, 'token-123');
    expect(result).toEqual({ indexed: 2, skipped: 1, failed: 0 });
  });
});

describe('OneDriveSyncTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('targets the outlook provider behind the onedrive flag', () => {
    const task = new OneDriveSyncTask();
    const config = (
      task as unknown as {
        config(): { taskType: string; featureFlag: string; expectedProviderId: string };
      }
    ).config();

    expect(config.featureFlag).toBe('onedrive');
    expect(config.expectedProviderId).toBe('microsoft-outlook');
  });

  it('delegates ingestion to OneDriveIngestionService', async () => {
    mocks.oneDriveIngest.mockResolvedValue({ indexed: 1, skipped: 0, failed: 0 });
    const task = new OneDriveSyncTask();
    const application = { applicationId: 'app-2' };

    const result = await (
      task as unknown as {
        ingestForApplication(env: unknown, application: unknown, token: string): Promise<unknown>;
      }
    ).ingestForApplication({}, application, 'token-456');

    expect(mocks.oneDriveIngest).toHaveBeenCalledWith(application, 'token-456');
    expect(result).toEqual({ indexed: 1, skipped: 0, failed: 0 });
  });
});
