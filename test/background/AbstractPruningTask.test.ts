import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startRun: vi.fn(),
  succeedRun: vi.fn(),
  failRun: vi.fn(),
  skipRun: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  BackgroundTaskRunDAO: class {
    startRun = mocks.startRun;
    succeedRun = mocks.succeedRun;
    failRun = mocks.failRun;
    skipRun = mocks.skipRun;
  },
}));

import { IScheduledTask } from '@mail-otter/background/scheduled';
import type { IEnv } from '@mail-otter/background/scheduled';

interface TestEnv extends IEnv {
  DB: D1Database;
}

class SuccessTask extends IScheduledTask<TestEnv> {
  protected getTaskType(): string | null {
    return 'test_task';
  }

  protected async handleScheduledTask(): Promise<{ itemsProcessed: number; itemsFailed: number }> {
    return { itemsProcessed: 3, itemsFailed: 0 };
  }
}

class VoidTask extends IScheduledTask<TestEnv> {
  protected getTaskType(): string | null {
    return 'void_task';
  }

  protected async handleScheduledTask(): Promise<void> {
    // Returns void — the template method records a zeroed summary.
  }
}

class FailingTask extends IScheduledTask<TestEnv> {
  protected getTaskType(): string | null {
    return 'failing_task';
  }

  protected async handleScheduledTask(): Promise<void> {
    throw new Error('prune exploded');
  }
}

class UntrackedTask extends IScheduledTask<TestEnv> {
  public calls = 0;

  protected async handleScheduledTask(): Promise<void> {
    this.calls += 1;
  }
}

class StartFailureTask extends UntrackedTask {
  protected getTaskType(): string | null {
    return 'flaky_task';
  }
}

class PerApplicationTask extends IScheduledTask<TestEnv> {
  public async runApplicationBranches(env: TestEnv): Promise<void> {
    const ok = await this.createApplicationRun('per_app_task', 'app-1', env.DB);
    await ok.succeed({ itemsProcessed: 2, itemsFailed: 0 });
    const failed = await this.createApplicationRun('per_app_task', 'app-2', env.DB);
    await failed.fail('boom', { itemsProcessed: 1, itemsFailed: 1 });
    const skipped = await this.createApplicationRun('per_app_task', 'app-3', env.DB);
    await skipped.skip('nothing to do');
  }

  protected async handleScheduledTask(): Promise<void> {
    // Exercised via runApplicationBranches instead.
  }
}

function createScheduledController(): ScheduledController {
  return { scheduledTime: 1_000_000, cron: '* * * * *', noRetry: vi.fn() };
}

function createExecutionContext(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
}

function createEnv(): Env {
  return { DB: {} } as unknown as Env;
}

describe('AbstractPruningTask (IScheduledTask template method)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.startRun.mockResolvedValue('run-1');
    mocks.succeedRun.mockResolvedValue(undefined);
    mocks.failRun.mockResolvedValue(undefined);
    mocks.skipRun.mockResolvedValue(undefined);
  });

  it('records a global run and marks it succeeded with the task summary', async () => {
    await new SuccessTask().handle(createScheduledController(), createEnv(), createExecutionContext());

    expect(mocks.startRun).toHaveBeenCalledWith({ taskType: 'test_task' });
    expect(mocks.succeedRun).toHaveBeenCalledWith('run-1', { itemsProcessed: 3, itemsFailed: 0 });
    expect(mocks.failRun).not.toHaveBeenCalled();
  });

  it('records a zeroed summary when the task returns void', async () => {
    await new VoidTask().handle(createScheduledController(), createEnv(), createExecutionContext());

    expect(mocks.startRun).toHaveBeenCalledWith({ taskType: 'void_task' });
    expect(mocks.succeedRun).toHaveBeenCalledWith('run-1', { itemsProcessed: 0, itemsFailed: 0 });
  });

  it('marks the run failed when the task throws, without rethrowing', async () => {
    await new FailingTask().handle(createScheduledController(), createEnv(), createExecutionContext());

    expect(mocks.failRun).toHaveBeenCalledWith('run-1', expect.stringContaining('prune exploded'));
    expect(mocks.succeedRun).not.toHaveBeenCalled();
  });

  it('skips run tracking when the task opts out via getTaskType', async () => {
    const task = new UntrackedTask();
    await task.handle(createScheduledController(), createEnv(), createExecutionContext());

    expect(task.calls).toBe(1);
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.succeedRun).not.toHaveBeenCalled();
    expect(mocks.failRun).not.toHaveBeenCalled();
  });

  it('still runs the task when starting the run record fails', async () => {
    mocks.startRun.mockRejectedValue(new Error('D1 down'));
    const task = new StartFailureTask();

    await expect(
      task.handle(createScheduledController(), createEnv(), createExecutionContext()),
    ).resolves.toBeUndefined();
    expect(task.calls).toBe(1);
    expect(mocks.succeedRun).not.toHaveBeenCalled();
  });

  it('supports per-application run handles for succeed, fail, and skip', async () => {
    mocks.startRun
      .mockResolvedValueOnce('run-app-1')
      .mockResolvedValueOnce('run-app-2')
      .mockResolvedValueOnce('run-app-3');

    await new PerApplicationTask().runApplicationBranches({ DB: {} as D1Database });

    expect(mocks.startRun).toHaveBeenCalledWith({ taskType: 'per_app_task', applicationId: 'app-1' });
    expect(mocks.succeedRun).toHaveBeenCalledWith('run-app-1', { itemsProcessed: 2, itemsFailed: 0 });
    expect(mocks.failRun).toHaveBeenCalledWith('run-app-2', 'boom', { itemsProcessed: 1, itemsFailed: 1 });
    expect(mocks.skipRun).toHaveBeenCalledWith('run-app-3', 'nothing to do');
  });
});
