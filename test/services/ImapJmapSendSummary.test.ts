import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDraftReply: vi.fn(),
}));

vi.mock('@mail-otter/provider-clients/fastmail', () => ({
  FastmailProviderUtil: {
    createDraftReply: mocks.createDraftReply,
  },
}));

import { ImapMessageProcessor, JmapMessageProcessor } from '@mail-otter/backend-services/email';

function createImapApplication() {
  return {
    applicationId: 'app-1',
    userEmail: 'owner@example.com',
    providerEmail: 'owner@example.com',
    contentLanguage: null,
  };
}

describe('ImapMessageProcessor.sendSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('appends the rendered summary to INBOX through the delivery template', async () => {
    const sendSummaryTemplate = vi.fn(async (_app: unknown, _messageId: string, _retry: unknown, send: () => Promise<void>) => {
      await send();
    });
    const append = vi.fn().mockResolvedValue(undefined);
    const processor = new ImapMessageProcessor({} as never, { sendSummaryTemplate } as never);

    await processor.sendSummary(
      {
        summaryHtml: '<p>Summary text</p>',
        emailSubject: 'Project update',
        emailFrom: 'sender@example.com',
        application: createImapApplication(),
        messageId: '<message-1@example.com>',
        uid: 42,
        options: {},
      } as never,
      { append } as never,
    );

    expect(sendSummaryTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-1' }),
      '<message-1@example.com>',
      undefined,
      expect.any(Function),
    );
    expect(append).toHaveBeenCalledOnce();
    const [mailbox, rfc2822] = append.mock.calls[0] as [string, string];
    expect(mailbox).toBe('INBOX');
    expect(rfc2822).toContain('Subject:');
    expect(rfc2822).toContain('Project update');
    expect(rfc2822).toContain('X-Mail-Otter-Summary: true');
    expect(rfc2822).toContain('<p>Summary text</p>');
  });
});

describe('JmapMessageProcessor.sendSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDraftReply.mockResolvedValue(undefined);
  });

  it('creates a Fastmail draft reply through the delivery template', async () => {
    const sendSummaryTemplate = vi.fn(async (_app: unknown, _messageId: string, _retry: unknown, send: () => Promise<void>) => {
      await send();
    });
    const processor = new JmapMessageProcessor({} as never, { sendSummaryTemplate } as never);

    await processor.sendSummary({
      email: { id: 'email-1' },
      summaryHtml: '<p>Summary text</p>',
      emailSubject: 'Project update',
      emailFrom: 'sender@example.com',
      application: { applicationId: 'app-1' },
      accessToken: 'token-123',
      emailId: 'email-1',
      options: {},
    } as never);

    expect(sendSummaryTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'app-1' }),
      'email-1',
      undefined,
      expect.any(Function),
    );
    expect(mocks.createDraftReply).toHaveBeenCalledWith('token-123', 'email-1', '<p>Summary text</p>');
  });
});
