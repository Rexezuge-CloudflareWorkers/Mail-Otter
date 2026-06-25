import { PROVIDER_FASTMAIL_JMAP } from '@mail-otter/shared/constants';
import { FastmailProviderUtil } from '@mail-otter/provider-clients/fastmail';
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

class FastmailEmailProvider implements IEmailProvider {
  public readonly providerId = PROVIDER_FASTMAIL_JMAP;
  public readonly supportsWebhooks = true;

  public async listFolders(accessToken: string): Promise<ProviderFolder[]> {
    const mailboxes = await FastmailProviderUtil.listMailboxes(accessToken);
    return mailboxes.map((m) => ({ id: m.id, name: m.name }));
  }

  public async stopWatch(accessToken: string, externalSubscriptionId?: string): Promise<void> {
    if (externalSubscriptionId) {
      await FastmailProviderUtil.deletePushSubscription(accessToken, externalSubscriptionId);
    }
  }

  public async startWatch(credentials: AnyProviderCredentials, input: StartWatchInput): Promise<ProviderWatchResult> {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Fastmail requires OAuth2 credentials.');
    const webhookUrl = `${input.baseUrl}/api/webhooks/fastmail/__APPLICATION_ID__`;
    const sub = await FastmailProviderUtil.createPushSubscription(credentials.accessToken, webhookUrl);
    const webhookSecret = WebhookSecurityUtil.generateSecret();
    const result: WebhookWatchResult = {
      type: 'webhook',
      externalSubscriptionId: sub.id,
      webhookSecretHash: await WebhookSecurityUtil.hashSecret(webhookSecret),
      webhookUrl: `${webhookUrl}?token=${encodeURIComponent(webhookSecret)}`,
      message: 'Fastmail JMAP push subscription started.',
    };
    return result;
  }

  public async renewWatch(credentials: AnyProviderCredentials, subscriptionId: string, _expiresAt: number | null): Promise<ProviderWatchResult> {
    // Fastmail push subscriptions do not expire; re-create if needed.
    if (credentials.type !== 'oauth2') throw new BadRequestError('Fastmail requires OAuth2 credentials.');
    try {
      await FastmailProviderUtil.deletePushSubscription(credentials.accessToken, subscriptionId);
    } catch {
      // ignore if already gone
    }
    return { type: 'webhook', externalSubscriptionId: subscriptionId };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async pollNewMessages(_credentials: AnyProviderCredentials, _cursor: string | null): Promise<{ messages: ProviderMessageSummary[]; newCursor: string }> {
    throw new BadRequestError('Fastmail uses JMAP push and does not support polling.');
  }

  public getProviderUrl(document: ApplicationContextDocumentSource, _application: ConnectedApplicationMetadata): string {
    return `https://www.fastmail.com/mail/Inbox/${encodeURIComponent(document.sourceDocumentId)}`;
  }

  public async createCalendarEvent(accessToken: string, payload: CalendarAddEventActionPayload): Promise<EmailActionResult> {
    const result = await FastmailProviderUtil.createCalendarEvent(accessToken, payload);
    return { summary: 'Calendar event created.', providerOperationId: result.id };
  }

  public async createDraftReply(
    accessToken: string,
    messageId: string,
    _fromEmail: string,
    payload: EmailDraftReplyActionPayload,
  ): Promise<EmailActionResult> {
    const result = await FastmailProviderUtil.createDraftReply(accessToken, messageId, payload.draftBody);
    return { summary: 'Draft reply created.', providerOperationId: result.id };
  }
}

export { FastmailEmailProvider };
