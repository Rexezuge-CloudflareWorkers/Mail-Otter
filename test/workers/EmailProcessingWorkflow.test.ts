import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import type { EmailQueueMessage } from '@mail-otter/shared/model';
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig, WorkflowStepContext } from 'cloudflare:workers';
import { NonRetryableError as WorkflowNonRetryableError } from 'cloudflare:workflows';

const { mockResolveApplication, mockGenerateOutlookSummary, mockSendOutlookSummary } = vi.hoisted(() => ({
  mockResolveApplication: vi.fn(),
  mockGenerateOutlookSummary: vi.fn(),
  mockSendOutlookSummary: vi.fn(),
}));

vi.mock('@mail-otter/backend-services/email', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    EmailApplicationResolver: vi.fn(function () {
      return { resolveApplication: mockResolveApplication };
    }),
    OutlookMessageProcessor: vi.fn(function () {
      return { generateSummary: mockGenerateOutlookSummary, sendSummary: mockSendOutlookSummary };
    }),
  };
});

vi.mock('@mail-otter/backend-services/integration', () => ({
  IntegrationService: vi.fn(function () {
    return { sendToIntegrations: vi.fn().mockResolvedValue(undefined) };
  }),
  IntegrationServiceFactory: { create: vi.fn() },
}));

import { EmailProcessingWorkflow } from '@mail-otter/background';

const resolvedApplication = {
  application: {
    applicationId: 'app-1',
    userEmail: 'owner@example.com',
    providerId: 'microsoft-outlook',
    providerEmail: 'owner@example.com',
    credentials: { refreshToken: 'refresh-token' },
  },
  accessToken: 'access-token',
  enabledApplicationIds: [],
};

describe('EmailProcessingWorkflow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('passes the workflow retry attempt into email processing', async () => {
    mockResolveApplication.mockResolvedValue(resolvedApplication);
    mockGenerateOutlookSummary.mockResolvedValue({
      message: { id: 'message-1', conversationId: 'conv-1' },
      summaryHtml: '<p>Summary</p>',
      rawSummary: { gist: 'Test gist.', keyDetails: [] },
      emailSubject: 'Test Subject',
      emailFrom: 'sender@example.com',
      actions: [],
      application: resolvedApplication.application,
      accessToken: resolvedApplication.accessToken,
      messageId: 'message-1',
      options: { retryAttempt: 3 },
    });
    mockSendOutlookSummary.mockResolvedValue();
    const workflow = new EmailProcessingWorkflow({} as ExecutionContext, createEnv());
    const step = createStep(3);
    const event = createEvent();

    await workflow.run(event, step);

    expect(mockGenerateOutlookSummary).toHaveBeenCalledWith(
      resolvedApplication.application,
      resolvedApplication.accessToken,
      'message-1',
      resolvedApplication.enabledApplicationIds,
      { retryAttempt: 3 },
    );
    expect(mockSendOutlookSummary).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'message-1' }));
  });

  it('leaves retryable errors retryable for the workflow step policy', async () => {
    mockResolveApplication.mockResolvedValue(resolvedApplication);
    const error = new RetryableError('Temporary provider failure.');
    mockGenerateOutlookSummary.mockRejectedValue(error);
    const workflow = new EmailProcessingWorkflow({} as ExecutionContext, createEnv());

    await expect(workflow.run(createEvent(), createStep(1))).rejects.toBe(error);
  });

  it('converts non-retryable errors into Cloudflare workflow fatal errors', async () => {
    mockResolveApplication.mockRejectedValue(new NonRetryableError('Application is not connected.'));
    const workflow = new EmailProcessingWorkflow({} as ExecutionContext, createEnv());

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

function createEnv(): Env {
  return {
    DB: {
      withSession: vi.fn(() => ({}) as D1DatabaseSession),
    } as unknown as D1Database,
  } as Env;
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
            name: _name,
            count: attempt,
          },
        });
      },
    ),
  };
}
