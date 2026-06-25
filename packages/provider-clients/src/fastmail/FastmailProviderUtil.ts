import { BadRequestError, InternalServerError } from '@mail-otter/backend-errors';
import type { CalendarAddEventActionPayload } from '@mail-otter/shared/model';

const JMAP_BASE = 'https://api.fastmail.com/jmap/session';

interface JmapSession {
  apiUrl: string;
  accounts: Record<string, { name: string; isPersonal: boolean }>;
  primaryAccounts: Record<string, string>;
}

interface JmapEmailResult {
  id: string;
  subject?: string | null;
  from?: Array<{ email: string; name?: string }> | null;
  receivedAt?: string | null;
  messageId?: string[] | null;
  threadId?: string | null;
  bodyValues?: Record<string, { value: string }> | null;
  textBody?: Array<{ partId: string }> | null;
}

interface JmapCalendarEventResult {
  id: string;
  uid: string;
}

export interface JmapProfileResult {
  email: string;
  displayName?: string;
}

export interface JmapMailboxResult {
  id: string;
  name: string;
  role?: string | null;
}

export interface JmapPushSubscription {
  id: string;
}

class FastmailProviderUtil {
  public static async getSession(accessToken: string): Promise<JmapSession> {
    const response = await fetch(JMAP_BASE, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new InternalServerError(`Fastmail JMAP session fetch failed: ${response.statusText}`);
    return response.json();
  }

  public static async getProfile(accessToken: string): Promise<JmapProfileResult> {
    const session = await this.getSession(accessToken);
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
    if (!accountId) throw new BadRequestError('No primary JMAP mail account found.');
    const account = session.accounts[accountId];
    return { email: account.name, displayName: account.name };
  }

  public static async listMailboxes(accessToken: string): Promise<JmapMailboxResult[]> {
    const session = await this.getSession(accessToken);
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
    const response = await this.callApi(session.apiUrl, accessToken, [
      ['Mailbox/get', { accountId, ids: null }, '0'],
    ]);
    const result = (response.methodResponses as [[string, { list: JmapMailboxResult[] }]])[0][1];
    return result.list ?? [];
  }

  public static async getEmail(accessToken: string, emailId: string): Promise<JmapEmailResult> {
    const session = await this.getSession(accessToken);
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
    const response = await this.callApi(session.apiUrl, accessToken, [
      [
        'Email/get',
        {
          accountId,
          ids: [emailId],
          properties: ['id', 'subject', 'from', 'receivedAt', 'messageId', 'threadId', 'textBody', 'bodyValues'],
          fetchTextBodyValues: true,
          maxBodyValueBytes: 32_768,
        },
        '0',
      ],
    ]);
    const result = (response.methodResponses as [[string, { list: JmapEmailResult[] }]])[0][1];
    const email = result.list?.[0];
    if (!email) throw new BadRequestError(`Fastmail email not found: ${emailId}`);
    return email;
  }

  public static async createDraftReply(accessToken: string, originalEmailId: string, draftBody: string): Promise<{ id: string }> {
    const session = await this.getSession(accessToken);
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:mail'];
    const original = await this.getEmail(accessToken, originalEmailId);
    const mailboxes = await this.listMailboxes(accessToken);
    const draftMailbox = mailboxes.find((m) => m.role === 'drafts');
    const draftMailboxId = draftMailbox?.id;
    if (!draftMailboxId) throw new BadRequestError('No Drafts mailbox found in Fastmail account.');
    const response = await this.callApi(session.apiUrl, accessToken, [
      [
        'Email/set',
        {
          accountId,
          create: {
            draft: {
              mailboxIds: { [draftMailboxId]: true },
              subject: `Re: ${original.subject ?? ''}`,
              keywords: { $draft: true },
              replyTo: original.from ?? [],
              textBody: [{ partId: 'body', type: 'text/plain' }],
              bodyValues: { body: { value: draftBody } },
              references: original.messageId ?? [],
              threadId: original.threadId,
            },
          },
        },
        '0',
      ],
    ]);
    const created = (response.methodResponses as [[string, { created: Record<string, { id: string }> }]])[0][1].created;
    const draft = created?.['draft'];
    if (!draft?.id) throw new InternalServerError('Fastmail draft creation returned no ID.');
    return { id: draft.id };
  }

  public static async createCalendarEvent(
    accessToken: string,
    payload: CalendarAddEventActionPayload,
  ): Promise<{ id: string; uid: string }> {
    const session = await this.getSession(accessToken);
    const accountId = session.primaryAccounts['urn:ietf:params:jmap:calendars'];
    if (!accountId) throw new BadRequestError('Fastmail calendar access is not authorized. Re-authorize with the Calendar feature enabled.');
    const uid = crypto.randomUUID();
    const start = payload.startTime ?? new Date().toISOString();
    const end = payload.endTime ?? new Date(Date.now() + 3600 * 1000).toISOString();
    const response = await this.callApi(session.apiUrl, accessToken, [
      [
        'CalendarEvent/set',
        {
          accountId,
          create: {
            event: {
              uid,
              calendarIds: {},
              title: payload.title,
              start,
              end,
              description: payload.description ?? '',
              timeZone: payload.timeZone ?? 'UTC',
            },
          },
        },
        '0',
      ],
    ]);
    const created = (response.methodResponses as [[string, { created: Record<string, JmapCalendarEventResult> }]])[0][1].created;
    const event = created?.['event'];
    if (!event?.id) throw new InternalServerError('Fastmail calendar event creation returned no ID.');
    return { id: event.id, uid };
  }

  public static async createPushSubscription(accessToken: string, webhookUrl: string): Promise<JmapPushSubscription> {
    const session = await this.getSession(accessToken);
    const response = await this.callApi(session.apiUrl, accessToken, [
      [
        'PushSubscription/set',
        {
          create: {
            sub: {
              deviceClientId: crypto.randomUUID(),
              url: webhookUrl,
              types: ['Email'],
            },
          },
        },
        '0',
      ],
    ]);
    const created = (response.methodResponses as [[string, { created: Record<string, JmapPushSubscription> }]])[0][1].created;
    const sub = created?.['sub'];
    if (!sub?.id) throw new InternalServerError('Fastmail push subscription creation returned no ID.');
    return sub;
  }

  public static async deletePushSubscription(accessToken: string, subscriptionId: string): Promise<void> {
    const session = await this.getSession(accessToken);
    await this.callApi(session.apiUrl, accessToken, [
      ['PushSubscription/set', { destroy: [subscriptionId] }, '0'],
    ]);
  }

  private static async callApi(
    apiUrl: string,
    accessToken: string,
    calls: unknown[][],
  ): Promise<{ methodResponses: unknown[][] }> {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:calendars', 'urn:ietf:params:jmap:submission'], methodCalls: calls }),
    });
    if (!response.ok) throw new InternalServerError(`Fastmail JMAP API call failed: ${response.statusText}`);
    return response.json();
  }
}

export { FastmailProviderUtil };
