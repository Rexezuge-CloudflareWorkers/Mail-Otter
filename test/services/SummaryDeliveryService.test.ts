import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByMessageId: vi.fn(),
  markSummarized: vi.fn(),
  markError: vi.fn(),
  logSummarySent: vi.fn(),
  logProcessingError: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ProcessedMessageDAO: class {
    getByMessageId = mocks.getByMessageId;
    markSummarized = mocks.markSummarized;
    markError = mocks.markError;
  },
  ApplicationContextDAO: class {},
}));

vi.mock('@mail-otter/backend-services/email/EmailProcessingAuditLogger', () => ({
  EmailProcessingAuditLogger: class {
    logSummarySent = mocks.logSummarySent;
    logProcessingError = mocks.logProcessingError;
  },
}));

import { SummaryDeliveryService } from '@mail-otter/backend-services/email/processing/SummaryDeliveryService';

function app() {
  return { applicationId: 'app-1' } as never;
}

describe('SummaryDeliveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips already-summarized messages', async () => {
    mocks.getByMessageId.mockResolvedValue({ status: 'summarized' });
    const send = vi.fn();
    await new SummaryDeliveryService({ DB: {} } as never).sendSummaryTemplate(app(), 'm1', undefined, send);
    expect(send).not.toHaveBeenCalled();
    expect(mocks.markSummarized).not.toHaveBeenCalled();
  });

  it('sends, audits, and marks summarized', async () => {
    mocks.getByMessageId.mockResolvedValue(null);
    const send = vi.fn().mockResolvedValue(undefined);
    await new SummaryDeliveryService({ DB: {} } as never).sendSummaryTemplate(app(), 'm1', 2, send);
    expect(send).toHaveBeenCalled();
    expect(mocks.logSummarySent).toHaveBeenCalled();
    expect(mocks.markSummarized).toHaveBeenCalledWith('app-1', 'm1');
  });

  it('records errors and rethrows classified failures', async () => {
    mocks.getByMessageId.mockResolvedValue(null);
    const send = vi.fn().mockRejectedValue(new Error('smtp down'));
    await expect(
      new SummaryDeliveryService({ DB: {} } as never).sendSummaryTemplate(app(), 'm1', undefined, send),
    ).rejects.toThrow();
    expect(mocks.markError).toHaveBeenCalledWith('app-1', 'm1', expect.anything());
    expect(mocks.logProcessingError).toHaveBeenCalled();
  });
});
