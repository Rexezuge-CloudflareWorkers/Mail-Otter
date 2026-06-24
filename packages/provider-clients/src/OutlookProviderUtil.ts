import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-otter/backend-errors';
import { EmailContentUtil } from './EmailContentUtil';
import { fetchJsonWithBearer, createProviderApiError } from './BaseProviderHttp';

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
  hasAttachments?: boolean | undefined;
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

interface OutlookCalendarEventListItem {
  id: string;
  subject?: string | undefined;
  body?: { contentType?: string | undefined; content?: string | undefined } | undefined;
  start?: { dateTime?: string | undefined; timeZone?: string | undefined } | undefined;
  end?: { dateTime?: string | undefined; timeZone?: string | undefined } | undefined;
  location?: { displayName?: string | undefined } | undefined;
}

class OutlookProviderUtil {
  private static readonly MESSAGE_NOT_FOUND_PATTERNS: RegExp[] = [
    /specified object was not found in the store/i,
    /object was not found/i,
    /erroritemnotfound/i,
  ];

  public static async listMailFolders(accessToken: string): Promise<OutlookMailFolder[]> {
    const data = await fetchJsonWithBearer<{ value?: OutlookMailFolder[] | undefined }>(
      'https://graph.microsoft.com/v1.0/me/mailFolders?$select=id,displayName&$top=100',
      accessToken,
      'Microsoft Graph',
    );
    return data.value || [];
  }

  public static async getProfile(accessToken: string): Promise<OutlookMailboxProfile> {
    const data = await fetchJsonWithBearer<{
      mail?: string | null | undefined;
      userPrincipalName?: string | null | undefined;
    }>('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', accessToken, 'Microsoft Graph');
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
    const data = await fetchJsonWithBearer<{
      id?: string | undefined;
      expirationDateTime?: string | undefined;
      resource?: string | undefined;
      error?: { message?: string | undefined } | undefined;
    }>('https://graph.microsoft.com/v1.0/subscriptions', accessToken, 'Microsoft Graph', {
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
    const data = await fetchJsonWithBearer<{
      id?: string | undefined;
      expirationDateTime?: string | undefined;
      resource?: string | undefined;
    }>(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`, accessToken, 'Microsoft Graph', {
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
      throw createProviderApiError('Microsoft Graph', 'delete subscription', response, await response.text());
    }
  }

  public static async getMessage(accessToken: string, messageId: string): Promise<OutlookMessage> {
    const url: URL = new URL(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`);
    url.searchParams.set('$select', 'id,subject,conversationId,internetMessageId,body,from,sender,internetMessageHeaders,hasAttachments');
    return fetchJsonWithBearer<OutlookMessage>(url.toString(), accessToken, 'Microsoft Graph', {
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
    return fetchJsonWithBearer<OutlookCalendarEventResult>('https://graph.microsoft.com/v1.0/me/events', accessToken, 'Microsoft Graph', {
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
    const draft = await fetchJsonWithBearer<OutlookDraftReplyResult>(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(originalMessageId)}/createReply`,
      accessToken,
      'Microsoft Graph',
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
      throw createProviderApiError('Microsoft Graph', 'send summary reply', response, await response.text());
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
    const data = await fetchJsonWithBearer<{
      value?: Array<{ id: string }> | undefined;
    }>(url.toString(), accessToken, 'Microsoft Graph');
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
      throw createProviderApiError('Microsoft Graph', 'copy message', response, await response.text());
    }
  }

  public static async listCalendarEventsByDateRange(
    accessToken: string,
    startDateTimeIso: string,
    endDateTimeIso: string,
  ): Promise<OutlookCalendarEventListItem[]> {
    const url = new URL('https://graph.microsoft.com/v1.0/me/calendarView');
    url.searchParams.set('startDateTime', startDateTimeIso);
    url.searchParams.set('endDateTime', endDateTimeIso);
    url.searchParams.set('$select', 'id,subject,body,start,end,location');
    url.searchParams.set('$top', '50');
    const data = await fetchJsonWithBearer<{ value?: OutlookCalendarEventListItem[] | undefined }>(url.toString(), accessToken, 'Microsoft Graph');
    return data.value || [];
  }

  public static async updateMessageProperties(
    accessToken: string,
    messageId: string,
    updates: { categories?: string[]; isRead?: boolean; flag?: { flagStatus: 'flagged' | 'notFlagged' } },
  ): Promise<void> {
    await fetchJsonWithBearer<Record<string, unknown>>(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`,
      accessToken,
      'Microsoft Graph',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    );
  }

  public static async moveToArchive(accessToken: string, messageId: string): Promise<void> {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/move`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ destinationId: 'archive' }),
    });
    if (!response.ok) {
      throw createProviderApiError('Microsoft Graph', 'move to archive', response, await response.text());
    }
  }

  public static async listOutlookCategories(accessToken: string): Promise<Array<{ id: string; displayName: string }>> {
    try {
      const data = await fetchJsonWithBearer<{ value?: Array<{ id: string; displayName: string }> | undefined }>(
        'https://graph.microsoft.com/v1.0/me/outlook/masterCategories',
        accessToken,
        'Microsoft Graph',
      );
      return data.value || [];
    } catch {
      return [];
    }
  }

  public static async sendStandaloneEmail(accessToken: string, to: string, subject: string, htmlBody: string): Promise<void> {
    const textBody: string = EmailContentUtil.normalizeText(EmailContentUtil.stripHtml(htmlBody));
    const response: Response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'html', content: htmlBody },
          toRecipients: [{ emailAddress: { address: to } }],
          internetMessageHeaders: [{ name: 'X-Mail-Otter-Digest', value: 'true' }],
        },
        saveToSentItems: false,
      }),
    });
    if (!response.ok) {
      throw createProviderApiError('Microsoft Graph', 'send digest email', response, await response.text());
    }
    // sendMail returns 202 with no body — nothing to parse
    void textBody;
  }

  private static async deleteMessage(accessToken: string, messageId: string): Promise<void> {
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404) {
      throw createProviderApiError('Microsoft Graph', 'delete message', response, await response.text());
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
  OutlookCalendarEventListItem,
  OutlookCalendarEventResult,
  OutlookDraftReplyResult,
  OutlookMailboxProfile,
  OutlookMailFolder,
  OutlookMessage,
  OutlookSubscriptionResult,
};
