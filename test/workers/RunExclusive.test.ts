import { describe, expect, it, beforeEach } from 'vitest';

/**
 * The mutual-exclusion primitive used by `OAuth2TokenRefreshWorker.runExclusive`.
 *
 * Duplicated here as a harness so the interleaving can be driven deterministically
 * with a mock clock; the worker itself is covered by
 * `test/workers/OAuth2TokenRefreshWorker.test.ts`.
 */
class ExclusiveRunner {
  private currentOperation: Promise<unknown> | undefined;

  public runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation: Promise<unknown> | undefined = this.currentOperation;
    const currentOperation: Promise<T> = previousOperation ? previousOperation.catch((): void => undefined).then(operation) : operation();
    this.currentOperation = currentOperation;
    return currentOperation.finally((): void => {
      if (this.currentOperation === currentOperation) {
        this.currentOperation = undefined;
      }
    });
  }
}

/**
 * The superseded implementation, kept to prove the regression test bites.
 */
class PreFixRunner {
  private currentOperation: Promise<unknown> | undefined;

  public async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation: Promise<unknown> | undefined = this.currentOperation;
    if (previousOperation) {
      await previousOperation.catch((): void => undefined);
    }
    const currentOperation: Promise<T> = operation();
    this.currentOperation = currentOperation;
    try {
      return await currentOperation;
    } finally {
      if (this.currentOperation === currentOperation) {
        this.currentOperation = undefined;
      }
    }
  }
}

interface Trace {
  order: string[];
  /**
   * Highest number of operations that were inside their critical section at once.
   */
  peakConcurrency: number;
  failures: number;
}

/**
 * Run `count` operations that all start "at the same time" and each hold the
 * critical section across two microtask turns.
 */
const drive = async (runner: { runExclusive: <T>(op: () => Promise<T>) => Promise<T> }, count: number): Promise<Trace> => {
  const order: string[] = [];
  let inside = 0;
  let peakConcurrency = 0;
  let failures = 0;

  const operation = (name: string) => async (): Promise<string> => {
    inside++;
    peakConcurrency = Math.max(peakConcurrency, inside);
    order.push(`enter:${name}`);
    // Two turns: enough for a competing caller to interleave if exclusion is broken.
    await Promise.resolve();
    await Promise.resolve();
    order.push(`exit:${name}`);
    inside--;
    return name;
  };

  const results = await Promise.allSettled(
    Array.from({ length: count }, (_unused, index: number) => runner.runExclusive(operation(`op${index}`))),
  );
  failures = results.filter((result) => result.status === 'rejected').length;

  return { order, peakConcurrency, failures };
};

describe('runExclusive mutual exclusion', () => {
  let runner: ExclusiveRunner;

  beforeEach(() => {
    runner = new ExclusiveRunner();
  });

  it('never runs two operations concurrently', async () => {
    const trace = await drive(runner, 5);
    expect(trace.peakConcurrency).toBe(1);
  });

  it('keeps enter/exit strictly nested', async () => {
    const { order } = await drive(runner, 4);
    // Every enter must be immediately followed by its matching exit.
    for (let i = 0; i < order.length; i += 2) {
      expect(order[i]?.startsWith('enter:')).toBe(true);
      expect(order[i + 1]).toBe(order[i]?.replace('enter:', 'exit:'));
    }
  });

  it('runs every operation and resolves each result', async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, (_unused, index: number) => runner.runExclusive(async (): Promise<number> => index)),
    );
    expect(results).toEqual([0, 1, 2]);
  });

  it('lets the queue keep draining after one operation rejects', async () => {
    const failing = runner.runExclusive(async (): Promise<string> => {
      throw new Error('provider 500');
    });
    await expect(failing).rejects.toThrow('provider 500');

    // A poisoned chain would make this reject with the previous error instead.
    await expect(runner.runExclusive(async (): Promise<string> => 'recovered')).resolves.toBe('recovered');
  });

  it('does not start the first operation any later than necessary', async () => {
    let started = false;
    const pending = runner.runExclusive(async (): Promise<string> => {
      started = true;
      return 'ok';
    });
    // With no predecessor the operation body runs synchronously, so there is no
    // artificial serialization latency on the common single-request path.
    expect(started).toBe(true);
    await expect(pending).resolves.toBe('ok');
  });

  it('would have raced before the fix', async () => {
    // Guards against this test silently passing for the wrong reason: the old
    // implementation really did interleave two callers.
    const legacy = await drive(new PreFixRunner(), 5);
    expect(legacy.peakConcurrency).toBeGreaterThan(1);
  });
});
