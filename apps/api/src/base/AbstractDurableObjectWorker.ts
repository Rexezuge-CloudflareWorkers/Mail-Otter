import { DurableObject } from 'cloudflare:workers';

type DurableObjectFetchRequest = Parameters<NonNullable<DurableObject<Env>['fetch']>>[0];
type DurableObjectFetchResult = ReturnType<NonNullable<DurableObject<Env>['fetch']>>;
type DurableObjectFetchResponse = Awaited<DurableObjectFetchResult>;

abstract class AbstractDurableObjectWorker extends DurableObject<Env> {
  protected printExecId(): string {
    const execId: string = crypto.randomUUID();
    console.log('Durable Object Execution ID:', execId);
    return execId;
  }

  public fetch(request: DurableObjectFetchRequest): DurableObjectFetchResult {
    this.printExecId();
    console.log('Durable Object triggered by HTTP request');
    return this.onRequest(request).catch((err: unknown): DurableObjectFetchResponse => {
      console.error('Unhandled error in durable object fetch():', err);
      return Response.json({ error: 'Internal Error' }, { status: 500 }) as DurableObjectFetchResponse;
    });
  }

  protected createExecutionContext(): ExecutionContext {
    return {
      waitUntil: (promise: Promise<unknown>): void => this.ctx.waitUntil(promise),
      passThroughOnException: (): void => undefined,
    } as unknown as ExecutionContext;
  }

  protected abstract onRequest(request: DurableObjectFetchRequest): Promise<DurableObjectFetchResponse>;
}

export { AbstractDurableObjectWorker };
