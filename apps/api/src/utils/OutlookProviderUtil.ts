import { InternalServerError } from '@/error';
import { EmailContentUtil } from './EmailContentUtil';

interface OutlookMailboxProfile {
  emailAddress: string;
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
  body?: { contentType?: string | undefined; content?: string | undefined } | undefined;
  from?: { emailAddress?: { address?: string | undefined; name?: string | undefined } | undefined } | undefined;
  sender?: { emailAddress?: { address?: string | undefined; name?: string | undefined } | undefined } | undefined;
  internetMessageHeaders?: Array<{ name: string; value: string }> | undefined;
}

class OutlookProviderUtil {
  private static readonly MESSAGE_NOT_FOUND_PATTERNS: RegExp[] = [
    /specified object was not found in the store/i,
    /object was not found/i,
    /erroritemnotfound/i,
  ];

  public static async getProfile(accessToken: string): Promise<OutlookMailboxProfile> {
    const data = await OutlookProviderUtil.fetchJson<{
      mail?: string | null | undefined;
      userPrincipalName?: string | null | undefined;
    }>('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', accessToken);
    const emailAddress: string | undefined = data.mail || data.userPrincipalName || undefined;
    if (!emailAddress) throw new InternalServerError('Microsoft Graph profile did not include a mailbox address.');
    return { emailAddress };
  }

  public static async createInboxSubscription(
    accessToken: string,
    notificationUrl: string,
    lifecycleNotificationUrl: string,
    clientState: string,
    expiresAt: number,
  ): Promise<OutlookSubscriptionResult> {
    const resource = "/me/mailFolders('Inbox')/messages";
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
      throw new InternalServerError(`Microsoft Graph subscription response was incomplete: ${data.error?.message || 'missing id'}`);
    }
    return {
      id: data.id,
      expiresAt: Math.floor(new Date(data.expirationDateTime).getTime() / 1000),
      resource: data.resource || resource,
    };
  }

  public static async renewSubscription(accessToken: string, subscriptionId: string, expiresAt: number): Promise<OutlookSubscriptionResult> {
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
      throw new InternalServerError('Microsoft Graph subscription renewal response was incomplete.');
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
      throw new InternalServerError(`Microsoft Graph delete subscription failed: ${await response.text()}`);
    }
  }

  public static async getMessage(accessToken: string, messageId: string): Promise<OutlookMessage> {
    const url: URL = new URL(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}`);
    url.searchParams.set('$select', 'id,subject,conversationId,body,from,sender,internetMessageHeaders');
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

  public static async sendSelfSummaryReply(accessToken: string, messageId: string, mailboxAddress: string, summary: string): Promise<void> {
    const draft = await OutlookProviderUtil.fetchJson<{ id?: string | undefined }>(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}/createReply`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: '' }),
      },
    );
    if (!draft.id) {
      throw new InternalServerError('Microsoft Graph createReply did not return a draft id.');
    }
    await OutlookProviderUtil.fetchJson<unknown>(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}`, accessToken, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: {
          contentType: 'Text',
          content: summary,
        },
        toRecipients: [{ emailAddress: { address: mailboxAddress } }],
        ccRecipients: [],
        bccRecipients: [],
        saveToSentItems: false,
      }),
    });
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(draft.id)}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new InternalServerError(`Microsoft Graph send summary failed: ${await response.text()}`);
    }
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
      throw new InternalServerError(`Microsoft Graph API error: ${data.error?.message || text || response.statusText}`);
    }
    return data as T;
  }
}

export { OutlookProviderUtil };
export type { OutlookMailboxProfile, OutlookMessage, OutlookSubscriptionResult };
