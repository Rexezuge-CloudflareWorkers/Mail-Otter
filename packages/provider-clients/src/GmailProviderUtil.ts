import { EmailContentUtil } from './EmailContentUtil';
import { WebhookSecurityUtil } from './WebhookSecurityUtil';
import type { GmailMessagePart, MailHeader } from './EmailContentUtil';
import { fetchJsonWithBearer, createProviderApiError } from './BaseProviderHttp';

interface GmailWatchResult {
  historyId: string;
  expiresAt: number;
}

interface GmailHistoryResult {
  historyId: string;
  messageIds: string[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[] | undefined;
  payload?: GmailMessagePart | undefined;
}

interface GmailProfile {
  emailAddress: string;
}

interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

interface GmailCalendarEventInput {
  eventTitle: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  location?: string | undefined;
  notes?: string | undefined;
}

interface GmailCalendarEventResult {
  id?: string | undefined;
  htmlLink?: string | undefined;
}

interface GmailDraftReplyResult {
  id?: string | undefined;
  message?: { id?: string | undefined; threadId?: string | undefined } | undefined;
}

class GmailProviderUtil {
  private static readonly MESSAGE_NOT_FOUND_PATTERN: RegExp = /Gmail request failed \(404\)/;

  public static async getProfile(accessToken: string): Promise<GmailProfile> {
    return fetchJsonWithBearer<GmailProfile>('https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken, 'Gmail');
  }

  public static async listLabels(accessToken: string): Promise<GmailLabel[]> {
    const data = await fetchJsonWithBearer<{ labels?: GmailLabel[] | undefined }>(
      'https://gmail.googleapis.com/gmail/v1/users/me/labels',
      accessToken,
      'Gmail',
    );
    return (data.labels || []).sort((a, b) => a.name.localeCompare(b.name));
  }

  public static async watchInbox(accessToken: string, topicName: string, labelIds?: string[]): Promise<GmailWatchResult> {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topicName,
        labelIds: labelIds && labelIds.length > 0 ? labelIds : ['INBOX'],
        labelFilterBehavior: 'INCLUDE',
      }),
    });
    const data = (await response.json()) as { historyId?: string; expiration?: string; error?: { message?: string } };
    if (!response.ok || !data.historyId || !data.expiration) {
      throw createProviderApiError('Gmail', 'watch', response, data.error?.message || response.statusText);
    }
    return {
      historyId: data.historyId,
      expiresAt: Math.floor(Number(data.expiration) / 1000),
    };
  }

  public static async stopWatch(accessToken: string): Promise<void> {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw createProviderApiError('Gmail', 'stop', response, await response.text());
    }
  }

  public static async listMessageIdsSince(accessToken: string, startHistoryId: string, labelIds?: string[]): Promise<GmailHistoryResult> {
    const messageIds: Set<string> = new Set<string>();
    let pageToken: string | undefined;
    let currentHistoryId = startHistoryId;
    const singleLabelId: string = labelIds && labelIds.length === 1 ? labelIds[0] : ((!labelIds || labelIds.length === 0) ? 'INBOX' : '');
    do {
      const url: URL = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history');
      url.searchParams.set('startHistoryId', startHistoryId);
      url.searchParams.set('historyTypes', 'messageAdded');
      if (singleLabelId) url.searchParams.set('labelId', singleLabelId);
      url.searchParams.set('maxResults', '500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const data = await fetchJsonWithBearer<GmailHistoryListResponse>(url.toString(), accessToken, 'Gmail');
      currentHistoryId = data.historyId || currentHistoryId;
      for (const history of data.history || []) {
        for (const added of history.messagesAdded || []) {
          if (added.message?.id) messageIds.add(added.message.id);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
    return { historyId: currentHistoryId, messageIds: [...messageIds] };
  }

  public static async getMessage(accessToken: string, messageId: string): Promise<GmailMessage> {
    const url: URL = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
    url.searchParams.set('format', 'FULL');
    return fetchJsonWithBearer<GmailMessage>(url.toString(), accessToken, 'Gmail');
  }

  public static isMessageNotFoundError(error: unknown): boolean {
    const message: string = error instanceof Error ? error.message : String(error);
    return GmailProviderUtil.MESSAGE_NOT_FOUND_PATTERN.test(message);
  }

  public static async createCalendarEvent(accessToken: string, input: GmailCalendarEventInput): Promise<GmailCalendarEventResult> {
    return fetchJsonWithBearer<GmailCalendarEventResult>('https://www.googleapis.com/calendar/v3/calendars/primary/events', accessToken, 'Gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: input.eventTitle,
        description: input.notes || undefined,
        location: input.location || undefined,
        start: { dateTime: input.startTime, timeZone: input.timeZone },
        end: { dateTime: input.endTime, timeZone: input.timeZone },
      }),
    });
  }

  public static async createDraftReply(
    accessToken: string,
    from: string,
    originalMessage: GmailMessage,
    draftBody: string,
    draftSubject?: string | undefined,
  ): Promise<GmailDraftReplyResult> {
    const message: string = GmailProviderUtil.createDraftReplyMimeMessage(from, originalMessage, draftBody, draftSubject);
    return fetchJsonWithBearer<GmailDraftReplyResult>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', accessToken, 'Gmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          threadId: originalMessage.threadId,
          raw: WebhookSecurityUtil.base64UrlEncodeString(message),
        },
      }),
    });
  }

  public static async sendSummaryReply(accessToken: string, from: string, originalMessage: GmailMessage, summary: string): Promise<void> {
    const headers: MailHeader[] | undefined = originalMessage.payload?.headers;
    const originalSubject: string = EmailContentUtil.getHeader(headers, 'Subject') || '(no subject)';
    const originalMessageId: string | undefined = EmailContentUtil.getHeader(headers, 'Message-ID');
    const originalReferences: string | undefined = EmailContentUtil.getHeader(headers, 'References');
    const replySubject: string = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
    const references: string = [originalReferences, originalMessageId].filter(Boolean).join(' ');
    const boundary: string = GmailProviderUtil.createSummaryMimeBoundary(originalMessage.id);
    const textSummary: string = EmailContentUtil.stripHtml(summary);
    const message: string = [
      `From: ${from}`,
      `To: ${from}`,
      `Subject: ${replySubject}`,
      ...(originalMessageId ? [`In-Reply-To: ${originalMessageId}`] : []),
      ...(references ? [`References: ${references}`] : []),
      'X-Mail-Otter-Summary: true',
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      EmailContentUtil.buildAlternativeMimeBody(textSummary, summary, boundary),
    ].join('\r\n');
    const response: Response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threadId: originalMessage.threadId,
        raw: WebhookSecurityUtil.base64UrlEncodeString(message),
      }),
    });
    if (!response.ok) {
      throw createProviderApiError('Gmail', 'send summary', response, await response.text());
    }
    const sentMessage = (await response.json()) as { id: string };
    await GmailProviderUtil.trashGmailMessage(sentMessage.id, accessToken);
  }

  private static async trashGmailMessage(messageId: string, accessToken: string): Promise<void> {
    const response: Response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      console.error(`Failed to trash Gmail message ${messageId}: ${await response.text()}`);
    }
  }

  private static createSummaryMimeBoundary(seed: string): string {
    const safeSeed: string = seed.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'message';
    return `mail-otter-summary-${safeSeed}`;
  }

  public static async listCalendarEventsByDateRange(
    accessToken: string,
    timeMinIso: string,
    timeMaxIso: string,
  ): Promise<GmailCalendarEventListItem[]> {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMinIso);
    url.searchParams.set('timeMax', timeMaxIso);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '50');
    const data = await fetchJsonWithBearer<{ items?: GmailCalendarEventListItem[] | undefined }>(url.toString(), accessToken, 'Gmail');
    return data.items || [];
  }

  public static async sendStandaloneEmail(accessToken: string, to: string, subject: string, htmlBody: string): Promise<void> {
    const textBody: string = EmailContentUtil.stripHtml(htmlBody);
    const boundary: string = `mail-otter-digest-${Date.now()}`;
    const message: string = [
      `From: ${to}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'X-Mail-Otter-Digest: true',
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      EmailContentUtil.buildAlternativeMimeBody(textBody, htmlBody, boundary),
    ].join('\r\n');
    const response: Response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: WebhookSecurityUtil.base64UrlEncodeString(message) }),
    });
    if (!response.ok) {
      throw createProviderApiError('Gmail', 'send digest email', response, await response.text());
    }
    const sent = (await response.json()) as { id: string };
    await GmailProviderUtil.trashGmailMessage(sent.id, accessToken);
  }

  private static createDraftReplyMimeMessage(
    from: string,
    originalMessage: GmailMessage,
    draftBody: string,
    draftSubject?: string | undefined,
  ): string {
    const headers: MailHeader[] | undefined = originalMessage.payload?.headers;
    const originalSubject: string = EmailContentUtil.getHeader(headers, 'Subject') || '(no subject)';
    const originalMessageId: string | undefined = EmailContentUtil.getHeader(headers, 'Message-ID');
    const originalReferences: string | undefined = EmailContentUtil.getHeader(headers, 'References');
    const replySubject: string = draftSubject || (/^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`);
    const references: string = [originalReferences, originalMessageId].filter(Boolean).join(' ');
    return [
      `From: ${from}`,
      `To: ${EmailContentUtil.getHeader(headers, 'From') || ''}`,
      `Subject: ${replySubject}`,
      ...(originalMessageId ? [`In-Reply-To: ${originalMessageId}`] : []),
      ...(references ? [`References: ${references}`] : []),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      draftBody,
    ].join('\r\n');
  }
}

interface GmailCalendarEventListItem {
  id: string;
  summary?: string | undefined;
  description?: string | undefined;
  location?: string | undefined;
  start?: { dateTime?: string | undefined; date?: string | undefined; timeZone?: string | undefined } | undefined;
  end?: { dateTime?: string | undefined; date?: string | undefined; timeZone?: string | undefined } | undefined;
}

interface GmailHistoryListResponse {
  history?:
    | Array<{
        messagesAdded?:
          | Array<{
              message?: { id?: string | undefined; threadId?: string | undefined } | undefined;
            }>
          | undefined;
      }>
    | undefined;
  nextPageToken?: string | undefined;
  historyId?: string | undefined;
}

export { GmailProviderUtil };
export type {
  GmailCalendarEventInput,
  GmailCalendarEventListItem,
  GmailCalendarEventResult,
  GmailDraftReplyResult,
  GmailHistoryResult,
  GmailLabel,
  GmailMessage,
  GmailProfile,
  GmailWatchResult,
};
