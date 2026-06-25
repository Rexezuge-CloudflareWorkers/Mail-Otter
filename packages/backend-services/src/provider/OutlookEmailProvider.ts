import { PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
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

class OutlookEmailProvider implements IEmailProvider {
  public readonly providerId = PROVIDER_MICROSOFT_OUTLOOK;
  public readonly supportsWebhooks = true;

  public async listFolders(accessToken: string): Promise<ProviderFolder[]> {
    const folders = await OutlookProviderUtil.listMailFolders(accessToken);
    return folders.map((folder) => ({ id: folder.id, name: folder.displayName }));
  }

  public async stopWatch(accessToken: string, externalSubscriptionId?: string): Promise<void> {
    if (externalSubscriptionId) {
      await OutlookProviderUtil.deleteSubscription(accessToken, externalSubscriptionId);
    }
  }

  public async startWatch(credentials: AnyProviderCredentials, input: StartWatchInput): Promise<ProviderWatchResult> {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Outlook requires OAuth2 credentials.');
    if (!input.clientState) throw new BadRequestError('clientState is required to start an Outlook subscription.');
    if (!input.expiresAt) throw new BadRequestError('expiresAt is required to start an Outlook subscription.');
    const appId = input.applicationId ?? '__APPLICATION_ID__';
    const notificationUrl = `${input.baseUrl}/api/webhooks/outlook/${appId}`;
    const lifecycleNotificationUrl = `${input.baseUrl}/api/webhooks/outlook/lifecycle/${appId}`;
    const graphSubscription = await OutlookProviderUtil.createInboxSubscription(
      credentials.accessToken,
      notificationUrl,
      lifecycleNotificationUrl,
      input.clientState,
      input.expiresAt,
      input.watchedFolderIds?.[0],
    );
    const result: WebhookWatchResult = {
      type: 'webhook',
      externalSubscriptionId: graphSubscription.id,
      clientStateHash: await WebhookSecurityUtil.hashSecret(input.clientState),
      resource: graphSubscription.resource,
      expiresAt: graphSubscription.expiresAt,
      webhookUrl: notificationUrl,
      message: 'Outlook subscription started.',
    };
    return result;
  }

  public async renewWatch(credentials: AnyProviderCredentials, subscriptionId: string, expiresAt: number | null): Promise<ProviderWatchResult> {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Outlook requires OAuth2 credentials.');
    if (!expiresAt) throw new BadRequestError('expiresAt is required to renew an Outlook subscription.');
    const renewed = await OutlookProviderUtil.renewSubscription(credentials.accessToken, subscriptionId, expiresAt);
    const result: WebhookWatchResult = {
      type: 'webhook',
      externalSubscriptionId: renewed.id,
      resource: renewed.resource,
      expiresAt: renewed.expiresAt,
    };
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async pollNewMessages(_credentials: AnyProviderCredentials, _cursor: string | null): Promise<{ messages: ProviderMessageSummary[]; newCursor: string }> {
    throw new BadRequestError('Outlook uses webhooks and does not support polling.');
  }

  public getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string {
    const url = new URL(`https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(document.sourceDocumentId)}`);
    if (application.providerEmail) url.searchParams.set('login_hint', application.providerEmail);
    return url.href;
  }

  public async createCalendarEvent(accessToken: string, payload: CalendarAddEventActionPayload): Promise<EmailActionResult> {
    const result = await OutlookProviderUtil.createCalendarEvent(accessToken, payload);
    return { summary: 'Calendar event created.', providerOperationId: result.id, providerUrl: result.webLink };
  }

  public async createDraftReply(
    accessToken: string,
    messageId: string,
    _fromEmail: string,
    payload: EmailDraftReplyActionPayload,
  ): Promise<EmailActionResult> {
    const result = await OutlookProviderUtil.createDraftReply(accessToken, messageId, payload.draftBody);
    return { summary: 'Draft reply created.', providerOperationId: result.id, providerUrl: result.webLink };
  }

  public async applyLabel(accessToken: string, messageId: string, labelName: string): Promise<void> {
    await OutlookProviderUtil.updateMessageProperties(accessToken, messageId, { categories: [labelName] });
  }

  public async archiveMessage(accessToken: string, messageId: string): Promise<void> {
    await OutlookProviderUtil.moveToArchive(accessToken, messageId);
  }

  public async markRead(accessToken: string, messageId: string): Promise<void> {
    await OutlookProviderUtil.updateMessageProperties(accessToken, messageId, { isRead: true });
  }

  public async starMessage(accessToken: string, messageId: string): Promise<void> {
    await OutlookProviderUtil.updateMessageProperties(accessToken, messageId, { flag: { flagStatus: 'flagged' } });
  }

  public async listLabels(accessToken: string): Promise<Array<{ id: string; name: string }>> {
    const categories = await OutlookProviderUtil.listOutlookCategories(accessToken);
    return categories.map((c) => ({ id: c.id, name: c.displayName }));
  }
}

export { OutlookEmailProvider };
