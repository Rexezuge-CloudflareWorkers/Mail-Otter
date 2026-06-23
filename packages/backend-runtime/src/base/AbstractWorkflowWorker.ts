import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

abstract class AbstractWorkflowWorker<
  TPayload extends Rpc.Serializable<TPayload>,
  TResult extends Rpc.Serializable<TResult>,
> extends WorkflowEntrypoint<Env, TPayload> {
  public async run(event: Readonly<WorkflowEvent<TPayload>>, step: WorkflowStep): Promise<TResult> {
    try {
      return await this.onWorkflow(event, step);
    } catch (err: unknown) {
      console.error('Unhandled error in workflow run():', err);
      throw err;
    }
  }

  protected abstract onWorkflow(event: Readonly<WorkflowEvent<TPayload>>, step: WorkflowStep): Promise<TResult>;
}

export { AbstractWorkflowWorker };
