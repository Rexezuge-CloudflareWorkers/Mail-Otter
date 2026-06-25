// Shared base for IMAP-based providers (Yahoo, Custom IMAP, Apple iCloud).
// Implements polling via cloudflare:sockets IMAP client.
import { BadRequestError } from '@mail-otter/backend-errors';
import { ImapClient } from '@mail-otter/provider-clients/imap';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { ApplicationContextDocumentSource, CalendarAddEventActionPayload, ConnectedApplicationMetadata, EmailActionResult, EmailDraftReplyActionPayload } from '@mail-otter/shared/model';
import type {
  AnyProviderCredentials,
  ImapCursorWatchResult,
  IEmailProvider,
  ProviderFolder,
  ProviderMessageSummary,
  ProviderWatchResult,
  StartWatchInput,
} from './IEmailProvider';

abstract class ImapEmailProviderBase implements IEmailProvider {
  public abstract readonly providerId: string;
  public readonly supportsWebhooks = false;

  protected abstract readonly defaultImapPort: number;
  protected abstract readonly defaultImapHost: string;

  protected abstract buildImapAuth(credentials: AnyProviderCredentials): ImapConnectOptions['auth'];

  protected resolveImapHost(credentials: AnyProviderCredentials): string {
    return credentials.type === 'imap-password' ? credentials.host : this.defaultImapHost;
  }

  protected resolveImapPort(credentials: AnyProviderCredentials): number {
    return credentials.type === 'imap-password' ? credentials.port : this.defaultImapPort;
  }

  protected resolveImapUsername(credentials: AnyProviderCredentials): string {
    if (credentials.type === 'imap-password') return credentials.username;
    throw new BadRequestError('Cannot resolve IMAP username from non-imap-password credentials in base implementation.');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async listFolders(_accessToken: string): Promise<ProviderFolder[]> {
    return [{ id: 'INBOX', name: 'Inbox' }];
  }

  public async stopWatch(_accessToken: string, _externalSubscriptionId?: string): Promise<void> {
    // No remote state to clean up for polling subscriptions.
  }

  public async startWatch(credentials: AnyProviderCredentials, _input: StartWatchInput): Promise<ProviderWatchResult> {
    const client = new ImapClient();
    try {
      await client.connect({
        host: this.resolveImapHost(credentials),
        port: this.resolveImapPort(credentials),
        username: this.resolveImapUsername(credentials),
        auth: this.buildImapAuth(credentials),
      });
      const result: ImapCursorWatchResult = { type: 'imap-cursor', imapCursor: '0' };
      return result;
    } finally {
      await client.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async renewWatch(_credentials: AnyProviderCredentials, _subscriptionId: string, _expiresAt: number | null): Promise<ProviderWatchResult> {
    // IMAP subscriptions do not expire; nothing to renew.
    return { type: 'imap-cursor', imapCursor: '0' };
  }

  public async pollNewMessages(credentials: AnyProviderCredentials, cursor: string | null): Promise<{ messages: ProviderMessageSummary[]; newCursor: string }> {
    const sinceUid = cursor ? Number(cursor) : 0;
    const client = new ImapClient();
    try {
      await client.connect({
        host: this.resolveImapHost(credentials),
        port: this.resolveImapPort(credentials),
        username: this.resolveImapUsername(credentials),
        auth: this.buildImapAuth(credentials),
      });
      const uids = await client.searchUidsSince(sinceUid);
      if (uids.length === 0) {
        return { messages: [], newCursor: cursor ?? '0' };
      }
      const headers = await client.fetchHeaders(uids);
      const messages: ProviderMessageSummary[] = headers.map((h) => ({
        uid: h.uid,
        messageId: h.messageId,
      }));
      const maxUid = Math.max(...uids);
      return { messages, newCursor: String(maxUid) };
    } finally {
      await client.close();
    }
  }

  public getProviderUrl(_document: ApplicationContextDocumentSource, _application: ConnectedApplicationMetadata): string {
    return '';
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async createCalendarEvent(_accessToken: string, _payload: CalendarAddEventActionPayload): Promise<EmailActionResult> {
    throw new BadRequestError('Calendar actions are not supported for this provider.');
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async createDraftReply(_accessToken: string, _messageId: string, _fromEmail: string, _payload: EmailDraftReplyActionPayload): Promise<EmailActionResult> {
    throw new BadRequestError('Draft reply actions are not yet supported for IMAP providers.');
  }
}

export { ImapEmailProviderBase };
