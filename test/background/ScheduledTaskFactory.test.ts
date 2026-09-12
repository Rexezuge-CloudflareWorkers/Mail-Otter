import { describe, expect, it, vi } from 'vitest';
import { IScheduledTask } from '../../apps/background/src/scheduled/IScheduledTask';

class TrackedTask extends IScheduledTask<{ DB: unknown }> {
  public readonly calls: string[] = [];

  protected getTaskType(): string | null {
    return 'test-task';
  }

  protected createTaskRunDAO(_db: never): never {
    const calls = this.calls;
    return {
      startRun: vi.fn(async () => {
        calls.push('start');
        return 'run-1';
      }),
      succeedRun: vi.fn(async () => {
        calls.push('succeed');
      }),
      failRun: vi.fn(async () => {
        calls.push('fail');
      }),
    } as never;
  }

  protected async handleScheduledTask(): Promise<{ itemsProcessed: number; itemsFailed: number }> {
    this.calls.push('run');
    return { itemsProcessed: 1, itemsFailed: 0 };
  }
}

describe('IScheduledTask task-run DAO factory', () => {
  it('records start/succeed around the task via the injected DAO', async () => {
    const task = new TrackedTask();
    await task.handle({} as never, { DB: {} } as never, {} as never);
    expect(task.calls).toEqual(['start', 'run', 'succeed']);
  });

  it('records failure when the task throws', async () => {
    class FailingTask extends TrackedTask {
      protected override async handleScheduledTask(): Promise<{ itemsProcessed: number; itemsFailed: number }> {
        throw new Error('boom');
      }
    }
    const task = new FailingTask();
    await task.handle({} as never, { DB: {} } as never, {} as never);
    expect(task.calls).toEqual(['start', 'fail']);
  });
});
