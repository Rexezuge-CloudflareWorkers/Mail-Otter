import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailProcessingAuditLogger } from '../../packages/backend-services/src/email/EmailProcessingAuditLogger';
import { NonRetryableError } from '@mail-otter/backend-errors';
import type { ConnectedApplication } from '@mail-otter/shared/model';

function makeApp(): ConnectedApplication {
  return { applicationId: 'app-1', userEmail: 'user@example.com' } as ConnectedApplication;
}

function makeDao(overrides: Record<string, unknown> = {}) {
  return {
    getContextDocumentIdBySource: vi.fn().mockResolvedValue('ctx-1'),
    insertAuditLog: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('EmailProcessingAuditLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs processing start without attempt for first tries', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logProcessingStarted(makeApp(), 'msg-1');
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'processing_started', eventData: undefined }),
    );
  });

  it('includes the attempt number for retries', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logProcessingStarted(makeApp(), 'msg-1', 3);
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventData: { attempt: 3 } }),
    );
  });

  it('logs summary generation with model and neuron estimate', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logSummaryGenerated(makeApp(), 'msg-1', 'model-x', 25, 2);
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'summary_generated',
        eventData: { summaryModel: 'model-x', estimatedNeurons: 25, attempt: 2 },
      }),
    );
  });

  it('logs created actions with counts and types', async () => {
    const dao = makeDao();
    const actions = [
      { action: { actionType: 'calendar.add_event' } },
      { action: { actionType: 'email.draft_reply' } },
    ] as never[];
    await new EmailProcessingAuditLogger(dao as never).logActionsCreated(makeApp(), 'msg-1', actions);
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'action_created',
        eventData: {
          actionCount: 2,
          actionTypes: ['calendar.add_event', 'email.draft_reply'],
        },
      }),
    );
  });

  it('logs summary sent events', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logSummarySent(makeApp(), 'msg-1', 2);
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'summary_sent', eventData: { attempt: 2 } }),
    );
  });

  it('logs attachment analysis with vision details', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logAttachmentAnalysis(makeApp(), 'msg-1', 'vision-m', 2, 11);
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'attachment_analyzed',
        eventData: { visionModel: 'vision-m', attachmentCount: 2, estimatedNeurons: 11 },
      }),
    );
  });

  it('logs model fallback as a warning with error details', async () => {
    const dao = makeDao();
    const error = new Error('primary exploded');
    await new EmailProcessingAuditLogger(dao as never).logModelFallback(makeApp(), 'msg-1', 'primary', error);
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'model_fallback',
        severity: 'warning',
        eventData: { primaryModel: 'primary', error: 'primary exploded', errorType: 'Error' },
      }),
    );
  });

  it('logs retryable processing errors as warnings', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logProcessingError(makeApp(), 'msg-1', new Error('boom'));
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'error', severity: 'warning' }),
    );
  });

  it('logs non-retryable processing errors as errors', async () => {
    const dao = makeDao();
    await new EmailProcessingAuditLogger(dao as never).logProcessingError(
      makeApp(),
      'msg-1',
      new NonRetryableError('fatal'),
    );
    expect(dao.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'error', severity: 'error' }),
    );
  });

  it('skips insert when no context document exists', async () => {
    const dao = makeDao({ getContextDocumentIdBySource: vi.fn().mockResolvedValue(undefined) });
    await new EmailProcessingAuditLogger(dao as never).logProcessingStarted(makeApp(), 'msg-1');
    expect(dao.insertAuditLog).not.toHaveBeenCalled();
  });

  it('swallows context lookup failures', async () => {
    const dao = makeDao({ getContextDocumentIdBySource: vi.fn().mockRejectedValue(new Error('db')) });
    await expect(
      new EmailProcessingAuditLogger(dao as never).logSummarySent(makeApp(), 'msg-1'),
    ).resolves.toBeUndefined();
    expect(dao.insertAuditLog).not.toHaveBeenCalled();
  });

  it('swallows audit insert failures', async () => {
    const dao = makeDao({ insertAuditLog: vi.fn().mockRejectedValue(new Error('db')) });
    await expect(
      new EmailProcessingAuditLogger(dao as never).logProcessingStarted(makeApp(), 'msg-1'),
    ).resolves.toBeUndefined();
  });
});
