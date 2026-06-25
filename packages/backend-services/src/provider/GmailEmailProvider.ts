import { PROVIDER_GOOGLE_GMAIL } from '@mail-otter/shared/constants';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { WebhookSecurityUtil } from '@mail-otter/provider-clients/webhook';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ApplicationContextDocumentSource, CalendarAddEventActionPayload, ConnectedApplicationMetadata, EmailActionResult, EmailDraftReplyActionPayload } from '@mail-otter/shared/model';
import type {
  AnyProviderCredentials,
  IEmailProvider,
  ProviderFolder,
  ProviderMessageSummary,
  ProviderWatchResult,
  StartWatchInput,
  WebhookWatchResult,
} from './IEmailProvider';

class GmailEmailProvider implements IEmailProvider {
  public readonly providerId = PROVIDER_GOOGLE_GMAIL;
  public readonly supportsWebhooks = true;

  public async listFolders(accessToken: string): Promise<ProviderFolder[]> {
    const labels = await GmailProviderUtil.listLabels(accessToken);
    return labels.map((label) => ({ id: label.id, name: label.name }));
  }

  public async stopWatch(accessToken: string): Promise<void> {
    await GmailProviderUtil.stopWatch(accessToken);
  }

  public async startWatch(credentials: AnyProviderCredentials, input: StartWatchInput): Promise<ProviderWatchResult> {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Gmail requires OAuth2 credentials.');
    if (!input.gmailPubsubTopicName) throw new BadRequestError('Gmail Pub/Sub topic name is required before starting Gmail watch.');
    const webhookSecret: string = WebhookSecurityUtil.generateSecret();
    const watch = await GmailProviderUtil.watchInbox(credentials.accessToken, input.gmailPubsubTopicName, input.watchedFolderIds);
    const result: WebhookWatchResult = {
      type: 'webhook',
      webhookSecretHash: await WebhookSecurityUtil.hashSecret(webhookSecret),
      gmailHistoryId: watch.historyId,
      resource: input.gmailPubsubTopicName,
      expiresAt: watch.expiresAt,
      webhookUrl: `${input.baseUrl}/api/webhooks/gmail/__APPLICATION_ID__?token=${encodeURIComponent(webhookSecret)}`,
      message: 'Gmail watch started. Configure your Google Pub/Sub push subscription to use the webhook URL.',
    };
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async renewWatch(credentials: AnyProviderCredentials, _subscriptionId: string, _expiresAt: number | null): Promise<ProviderWatchResult> {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Gmail requires OAuth2 credentials.');
    throw new BadRequestError('Gmail renewal must be triggered by the subscription renewal util with topic context.');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async pollNewMessages(_credentials: AnyProviderCredentials, _cursor: string | null): Promise<{ messages: ProviderMessageSummary[]; newCursor: string }> {
    throw new BadRequestError('Gmail uses webhooks and does not support polling.');
  }

  public getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string {
    const url = new URL('https://mail.google.com/mail/u/');
    if (application.providerEmail) url.searchParams.set('authuser', application.providerEmail);
    url.hash = `all/${document.sourceThreadId || document.sourceDocumentId}`;
    return url.href;
  }

  public async createCalendarEvent(accessToken: string, payload: CalendarAddEventActionPayload): Promise<EmailActionResult> {
    const result = await GmailProviderUtil.createCalendarEvent(accessToken, payload);
    return { summary: 'Calendar event created.', providerOperationId: result.id, providerUrl: result.htmlLink };
  }

  public async createDraftReply(
    accessToken: string,
    messageId: string,
    fromEmail: string,
    payload: EmailDraftReplyActionPayload,
  ): Promise<EmailActionResult> {
    const message = await GmailProviderUtil.getMessage(accessToken, messageId);
    const result = await GmailProviderUtil.createDraftReply(accessToken, fromEmail, message, payload.draftBody, payload.draftSubject);
    return { summary: 'Draft reply created.', providerOperationId: result.id || result.message?.id };
  }

  public async applyLabel(accessToken: string, messageId: string, labelName: string): Promise<void> {
    const labelId = await GmailProviderUtil.findOrCreateLabel(accessToken, labelName);
    await GmailProviderUtil.modifyMessage(accessToken, messageId, [labelId], []);
  }

  public async archiveMessage(accessToken: string, messageId: string): Promise<void> {
    await GmailProviderUtil.modifyMessage(accessToken, messageId, [], ['INBOX']);
  }

  public async markRead(accessToken: string, messageId: string): Promise<void> {
    await GmailProviderUtil.modifyMessage(accessToken, messageId, [], ['UNREAD']);
  }

  public async starMessage(accessToken: string, messageId: string): Promise<void> {
    await GmailProviderUtil.modifyMessage(accessToken, messageId, ['STARRED'], []);
  }

  public async listLabels(accessToken: string): Promise<Array<{ id: string; name: string }>> {
    const labels = await GmailProviderUtil.listLabels(accessToken);
    return labels.map((l) => ({ id: l.id, name: l.name }));
  }
}

export { GmailEmailProvider };
