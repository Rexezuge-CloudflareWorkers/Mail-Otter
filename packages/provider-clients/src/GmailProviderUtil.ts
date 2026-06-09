import { ProviderApiNonRetryableError, ProviderApiRetryableError } from '@mail-otter/backend-errors';
import { EmailContentUtil } from './EmailContentUtil';
import { WebhookSecurityUtil } from './WebhookSecurityUtil';
import type { GmailMessagePart, MailHeader } from './EmailContentUtil';

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

class GmailProviderUtil {
  public static async getProfile(accessToken: string): Promise<GmailProfile> {
    return GmailProviderUtil.fetchJson<GmailProfile>('https://gmail.googleapis.com/gmail/v1/users/me/profile', accessToken);
  }

  public static async listLabels(accessToken: string): Promise<GmailLabel[]> {
    const data = await GmailProviderUtil.fetchJson<{ labels?: GmailLabel[] | undefined }>(
      'https://gmail.googleapis.com/gmail/v1/users/me/labels',
      accessToken,
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
      throw GmailProviderUtil.createApiError('watch', response, data.error?.message || response.statusText);
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
      throw GmailProviderUtil.createApiError('stop', response, await response.text());
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
      const data = await GmailProviderUtil.fetchJson<GmailHistoryListResponse>(url.toString(), accessToken);
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
    return GmailProviderUtil.fetchJson<GmailMessage>(url.toString(), accessToken);
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
      throw GmailProviderUtil.createApiError('send summary', response, await response.text());
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

  private static async fetchJson<T>(url: string, accessToken: string): Promise<T> {
    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text: string = await response.text();
    const data = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });
    if (!response.ok) {
      throw GmailProviderUtil.createApiError('request', response, data.error?.message || text || response.statusText);
    }
    return data as T;
  }

  private static createApiError(operation: string, response: Response, detail: string): Error {
    const message: string = `Gmail ${operation} failed (${response.status}): ${detail || response.statusText}`;
    if (GmailProviderUtil.isRetryableStatus(response.status)) {
      return new ProviderApiRetryableError(message);
    }
    return new ProviderApiNonRetryableError(message);
  }

  private static isRetryableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }

  private static createSummaryMimeBoundary(seed: string): string {
    const safeSeed: string = seed.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'message';
    return `mail-otter-summary-${safeSeed}`;
  }
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
export type { GmailHistoryResult, GmailLabel, GmailMessage, GmailProfile, GmailWatchResult };
