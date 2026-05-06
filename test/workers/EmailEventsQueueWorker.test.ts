import { EmailEventsDispatcherWorker } from '@/workers';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EmailQueueMessage } from '@mail-otter/shared/model';

describe('EmailEventsDispatcherWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('acks dispatched workflow messages', async () => {
    const worker = new EmailEventsDispatcherWorker();
    const ack = vi.fn();
    const retry = vi.fn();
    const createBatch = vi.fn().mockResolvedValue([]);

    await worker.queue(
      {
        messages: [
          {
            id: 'message-1',
            timestamp: new Date(),
            body: { applicationId: 1, provider: 'google-gmail' } as EmailQueueMessage,
            attempts: 1,
            ack,
            retry,
          },
        ],
        queue: 'mail-otter-email-events',
        retryAll: vi.fn(),
        ackAll: vi.fn(),
      } as unknown as MessageBatch<unknown>,
      { EMAIL_PROCESSING_WORKFLOW: { createBatch } } as unknown as Env,
      {} as ExecutionContext,
    );

    expect(createBatch).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
