import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-otter/backend-errors';
import { EmailContentUtil } from './EmailContentUtil';

interface OutlookMailboxProfile {
  emailAddress: string;
}

interface OutlookMailFolder {
  id: string;
  displayName: string;
}

interface OutlookSubscriptionResult {
  id: string;
  expiresAt: number;
  resource: string;
}

interface OutlookMessage {
  id: string;
  subject?: string | undefined;
  conversationId?: string | undefined;
  internetMessageId?: string | undefined;
  body?: { contentType?: string | undefined; content?: string | undefined } | undefined;
  from?: { emailAddress?: { address?: string | undefined; name?: string | undefined } | undefined } | undefined;
  sender?: { emailAddress?: { address?: string | undefined; name?: string | undefined } | undefined } | undefined;
  internetMessageHeaders?: Array<{ name: string; value: string }> | undefined;
  webLink?: string | undefined;
}

interface OutlookCalendarEventInput {
  eventTitle: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  location?: string | undefined;
  notes?: string | undefined;
}

interface OutlookCalendarEventResult {
  id?: string | undefined;
  webLink?: string | undefined;
}

interface OutlookDraftReplyResult {
  id?: string | undefined;
  webLink?: string | undefined;
}

class OutlookProviderUtil {
  private static readonly MESSAGE_NOT_FOUND_PATTERNS: RegExp[] = [
    /specified object was not found in the store/i,
    /object was not found/i,
    /erroritemnotfound/i,
  ];

  public static async listMailFolders(accessToken: string): Promise<OutlookMailFolder[]> {
    const data = await OutlookProviderUtil.fetchJson<{ value?: OutlookMailFolder[] | undefined }>(
      'https://graph.microsoft.com/v1.0/me/mailFolders?$select=id,displayName&$top=100',
      accessToken,
    );
    return data.value || [];
  }

  public static async getProfile(accessToken: string): Promise<OutlookMailboxProfile> {
    const data = await OutlookProviderUtil.fetchJson<{
      mail?: string | null | undefined;
      userPrincipalName?: string | null | undefined;
    }>('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', accessToken);
    const emailAddress: string | undefined = data.mail || data.userPrincipalName || undefined;
    if (!emailAddress) throw new ProviderApiNonRetryableError('Microsoft Graph profile did not include a mailbox address.');
    return { emailAddress };
  }

  public static async createInboxSubscription(
    accessToken: string,
    notificationUrl: string,
    lifecycleNotificationUrl: string,
    clientState: string,
    expiresAt: number,
    folderId?: string,
  ): Promise<OutlookSubscriptionResult> {
    const resource = `/me/mailFolders('${folderId ?? 'Inbox'}')/messages`;
    const data = await OutlookProviderUtil.fetchJson<{
      id?: string | undefined;
      expirationDateTime?: string | undefined;
      resource?: string | undefined;
      error?: { message?: string | undefined } | undefined;
    }>('https://graph.microsoft.com/v1.0/subscriptions', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        changeType: 'created',
        notificationUrl,
        lifecycleNotificationUrl,
        resource,
        expirationDateTime: new Date(expiresAt * 1000).toISOString(),
        clientState,
      }),
    });
    if (!data.id || !data.expirationDateTime) {
      throw new ProviderApiRetryableError(`Microsoft Graph subscription response was incomplete: ${data.error?.message || 'missing id'}`);
    }
    return {
      id: data.id,
      expiresAt: Math.floor(new Date(data.expirationDateTime).getTime() / 1000),
      resource: data.resource || resource,
    };
  }

  public static async renewSubscription(
    accessToken: string,
    subscriptionId: string,
    expiresAt: number,
  ): Promise<OutlookSubscriptionResult> {
    const data = await OutlookProviderUtil.fetchJson<{
      id?: string | undefined;
      expirationDateTime?: string | undefined;
      resource?: string | undefined;
    }>(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`, accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expirationDateTime: new Date(expiresAt * 1000).toISOString() }),
    });
    if (!data.id || !data.expirationDateTime) {
      throw new ProviderApiRetryableError('Microsoft Graph subscription renewal response was incomplete.');
    }
    return {
      id: data.id,
      expiresAt: Math.floor(new Date(data.expirationDateTime).getTime() / 1000),
      resource: data.resource || "/me/mailFolders('Inbox')/messages",
    };
  }

  public static async deleteSubscription(accessToken: string, subscriptionId: string): Promise<void> {
    const response = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) {
      throw OutlookProviderUtil.createApiError('delete subscription', response, await response.text());
    }
  }

  public static async getMessage(accessToken: string, messageId: string): Promise<OutlookMessage> {
    const url: URL = new URL(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`);
    url.searchParams.set('$select', 'id,subject,conversationId,internetMessageId,body,from,sender,internetMessageHeaders');
    return OutlookProviderUtil.fetchJson<OutlookMessage>(url.toString(), accessToken, {
      headers: { Prefer: 'outlook.body-content-type="text"' },
    });
  }

  public static getMessageText(message: OutlookMessage): string {
    const content: string = message.body?.content || '';
    if (message.body?.contentType?.toLowerCase() === 'html') {
      return EmailContentUtil.normalizeText(EmailContentUtil.stripHtml(content));
    }
    return EmailContentUtil.normalizeText(content);
  }

  public static async createCalendarEvent(accessToken: string, input: OutlookCalendarEventInput): Promise<OutlookCalendarEventResult> {
    return OutlookProviderUtil.fetchJson<OutlookCalendarEventResult>('https://graph.microsoft.com/v1.0/me/events', accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: input.eventTitle,
        body: {
          contentType: 'text',
          content: input.notes || '',
        },
        start: {
          dateTime: input.startTime,
          timeZone: input.timeZone,
        },
        end: {
          dateTime: input.endTime,
          timeZone: input.timeZone,
        },
        ...(input.location ? { location: { displayName: input.location } } : {}),
      }),
    });
  }

  public static async createDraftReply(
    accessToken: string,
    originalMessageId: string,
    draftBody: string,
  ): Promise<OutlookDraftReplyResult> {
    const draft = await OutlookProviderUtil.fetchJson<OutlookDraftReplyResult>(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(originalMessageId)}/createReply`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: draftBody }),
      },
    );
    if (!draft.id) {
      throw new ProviderApiRetryableError('Microsoft Graph createReply did not return a draft id.');
    }
    return draft;
  }

  public static async sendSelfSummaryReply(
    accessToken: string,
    originalMessage: OutlookMessage,
    mailboxAddress: string,
    summary: string,
  ): Promise<void> {
    const marker: string = await OutlookProviderUtil.deriveMessageMarker(originalMessage.id);

    // Idempotency: if this email's summary already in Inbox, all steps completed
    const inboxMsgId: string | null = await OutlookProviderUtil.findSummaryMessageInFolder(accessToken, 'inbox', marker);
    if (inboxMsgId) {
      // Clean up any leftover Sent Items copy if a previous delete attempt failed
      const staleSentMsgId: string | null = await OutlookProviderUtil.findSummaryMessageInFolder(accessToken, 'sentitems', marker);
      if (staleSentMsgId) {
        await OutlookProviderUtil.deleteMessage(accessToken, staleSentMsgId);
      }
      return;
    }

    // If this email's summary in Sent Items only, reply was sent but copy+delete are pending
    const sentMsgId: string | null = await OutlookProviderUtil.findSummaryMessageInFolder(accessToken, 'sentitems', marker);
    if (sentMsgId) {
      await OutlookProviderUtil.copyMessage(accessToken, sentMsgId, 'inbox');
      await OutlookProviderUtil.deleteMessage(accessToken, sentMsgId);
      return;
    }

    // First attempt: send reply
    const atIndex: number = mailboxAddress.lastIndexOf('@');
    const sinkAddress: string = atIndex !== -1
      ? `${mailboxAddress.slice(0, atIndex)}+sink${mailboxAddress.slice(atIndex)}`
      : mailboxAddress;
    const originalSubject: string = originalMessage.subject || '';
    const response: Response = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(originalMessage.id)}/reply`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: `[${marker}] Re: ${originalSubject}`,
            body: {
              contentType: 'html',
              content: summary,
            },
            toRecipients: [
              {
                emailAddress: {
                  address: sinkAddress,
                },
              },
            ],
            internetMessageHeaders: [
              { name: 'X-Mail-Otter-Summary', value: 'true' },
            ],
          },
        }),
      },
    );
    if (!response.ok) {
      throw OutlookProviderUtil.createApiError('send summary reply', response, await response.text());
    }
    const sentMessageId: string = await OutlookProviderUtil.findSentSummaryMessage(accessToken, marker);
    await OutlookProviderUtil.copyMessage(accessToken, sentMessageId, 'inbox');
    await OutlookProviderUtil.deleteMessage(accessToken, sentMessageId);
  }

  private static async findSummaryMessageInFolder(accessToken: string, folderId: string, marker?: string): Promise<string | null> {
    const url: URL = new URL(`https://graph.microsoft.com/v1.0/me/mailFolders/${folderId}/messages`);
    url.searchParams.set(
      '$filter',
      marker
        ? `startswith(subject, '[${marker}]')`
        : `startswith(subject, '[')`,
    );
    url.searchParams.set('$top', '1');
    url.searchParams.set('$select', 'id');
    const data = await OutlookProviderUtil.fetchJson<{
      value?: Array<{ id: string }> | undefined;
    }>(url.toString(), accessToken);
    return data.value && data.value.length > 0 ? data.value[0].id : null;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private static async findSentSummaryMessage(accessToken: string, marker: string): Promise<string> {
    const delays = [1000, 2000, 4000];
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      if (attempt > 0) {
        await OutlookProviderUtil.sleep(delays[attempt - 1]);
      }
      const id: string | null = await OutlookProviderUtil.findSummaryMessageInFolder(accessToken, 'sentitems', marker);
      if (id) {
        return id;
      }
    }
    throw new ProviderApiRetryableError('Microsoft Graph did not return the sent summary message.');
  }

  public static isMessageNotFoundError(error: unknown): boolean {
    const message: string = error instanceof Error ? error.message : String(error);
    return OutlookProviderUtil.MESSAGE_NOT_FOUND_PATTERNS.some((pattern: RegExp): boolean => pattern.test(message));
  }

  private static async fetchJson<T>(url: string, accessToken: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    const response: Response = await fetch(url, { ...init, headers });
    const text: string = await response.text();
    const data = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });
    if (!response.ok) {
      throw OutlookProviderUtil.createApiError('request', response, data.error?.message || text || response.statusText);
    }
    return data as T;
  }

  private static createApiError(operation: string, response: Response, detail: string): Error {
    const message: string = `Microsoft Graph ${operation} failed (${response.status}): ${detail || response.statusText}`;
    if (OutlookProviderUtil.isRetryableStatus(response.status)) {
      return new ProviderApiRetryableError(message);
    }
    return new ProviderApiNonRetryableError(message);
  }

  private static isRetryableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }

  private static async copyMessage(accessToken: string, messageId: string, destinationId: string): Promise<void> {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ destinationId }),
    });
    if (!response.ok) {
      throw OutlookProviderUtil.createApiError('copy message', response, await response.text());
    }
  }

  private static async deleteMessage(accessToken: string, messageId: string): Promise<void> {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) {
      throw OutlookProviderUtil.createApiError('delete message', response, await response.text());
    }
  }

  private static async deriveMessageMarker(messageId: string): Promise<string> {
    const bytes = new TextEncoder().encode(messageId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hashBuffer))
      .slice(0, 8)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}

export { OutlookProviderUtil };
export type {
  OutlookCalendarEventInput,
  OutlookCalendarEventResult,
  OutlookDraftReplyResult,
  OutlookMailboxProfile,
  OutlookMailFolder,
  OutlookMessage,
  OutlookSubscriptionResult,
};
