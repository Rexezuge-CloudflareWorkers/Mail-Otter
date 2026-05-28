import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig, WorkflowStepContext } from 'cloudflare:workers';
import { NonRetryableError as WorkflowNonRetryableError } from 'cloudflare:workflows';

vi.mock('@mail-otter/backend-services/email', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@mail-otter/backend-services/email');
  return {
    ...actual,
    EmailProcessingUtil: {
      ...actual.EmailProcessingUtil,
      processQueueMessage: vi.fn(),
    },
  };
});

import { EmailProcessingWorkflow } from '@mail-otter/background';
import { EmailProcessingUtil } from '@mail-otter/backend-services/email';

describe('EmailProcessingWorkflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the workflow retry attempt into email processing', async () => {
    vi.mocked(EmailProcessingUtil.processQueueMessage).mockResolvedValue();
    const workflow = new EmailProcessingWorkflow({} as ExecutionContext, {} as Env);
    const step = createStep(3);
    const event = createEvent();

    await workflow.run(event, step);

    expect(EmailProcessingUtil.processQueueMessage).toHaveBeenCalledWith(event.payload, {}, { retryAttempt: 3 });
  });

  it('leaves retryable errors retryable for the workflow step policy', async () => {
    const error = new RetryableError('Temporary provider failure.');
    vi.mocked(EmailProcessingUtil.processQueueMessage).mockRejectedValue(error);
    const workflow = new EmailProcessingWorkflow({} as ExecutionContext, {} as Env);

    await expect(workflow.run(createEvent(), createStep(1))).rejects.toBe(error);
  });

  it('converts non-retryable errors into Cloudflare workflow fatal errors', async () => {
    vi.mocked(EmailProcessingUtil.processQueueMessage).mockRejectedValue(new NonRetryableError('Application is not connected.'));
    const workflow = new EmailProcessingWorkflow({} as ExecutionContext, {} as Env);

    await expect(workflow.run(createEvent(), createStep(1))).rejects.toThrow(WorkflowNonRetryableError);
  });
});

function createEvent(): Readonly<WorkflowEvent<EmailQueueMessage>> {
  return {
    payload: {
      type: 'outlook-notification',
      applicationId: 'app-1',
      subscriptionId: 'subscription-1',
      messageId: 'message-1',
    } as EmailQueueMessage,
    timestamp: new Date(),
    instanceId: 'workflow-instance-1',
  };
}

function createStep(attempt: number): WorkflowStep {
  return {
    do: vi.fn(
      async <T>(
        _name: string,
        configOrCallback: WorkflowStepConfig | ((context: WorkflowStepContext) => Promise<T>),
        callback?: (context: WorkflowStepContext) => Promise<T>,
      ): Promise<T> => {
        const stepCallback = typeof configOrCallback === 'function' ? configOrCallback : callback!;
        return stepCallback({
          attempt,
          config: typeof configOrCallback === 'function' ? {} : configOrCallback,
          step: {
            name: 'process email event',
            count: attempt,
          },
        });
      },
    ),
  } as unknown as WorkflowStep;
}
