import { BadRequestError } from '@mail-otter/backend-errors';
import type { ApplicationContextDocumentSource, CalendarAddEventActionPayload, ConnectedApplicationMetadata, EmailActionResult, EmailDraftReplyActionPayload } from '@mail-otter/shared/model';
import type {
  AnyProviderCredentials,
  IEmailProvider,
  ProviderCredentials,
  ProviderFolder,
  ProviderMessageSummary,
  ProviderWatchResult,
  StartWatchInput,
} from './IEmailProvider';

// Template base for OAuth2 (webhook-capable) providers: Gmail, Outlook, Fastmail.
// Centralizes OAuth2 credential assertion and poll-not-supported semantics.
abstract class AbstractOAuthEmailProvider implements IEmailProvider {
  public abstract readonly providerId: string;
  public readonly supportsWebhooks = true;

  public abstract listFolders(accessToken: string): Promise<ProviderFolder[]>;

  public abstract stopWatch(accessToken: string, externalSubscriptionId?: string): Promise<void>;

  public abstract startWatch(credentials: AnyProviderCredentials, input: StartWatchInput): Promise<ProviderWatchResult>;

  public abstract renewWatch(credentials: AnyProviderCredentials, subscriptionId: string, expiresAt: number | null): Promise<ProviderWatchResult>;

  public abstract pollNewMessages(credentials: AnyProviderCredentials, cursor: string | null): Promise<{ messages: ProviderMessageSummary[]; newCursor: string }>;

  public abstract getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string;

  public abstract createCalendarEvent(accessToken: string, payload: CalendarAddEventActionPayload): Promise<EmailActionResult>;

  public abstract createDraftReply(accessToken: string, messageId: string, fromEmail: string, payload: EmailDraftReplyActionPayload): Promise<EmailActionResult>;

  protected requireOAuth2Credentials(credentials: AnyProviderCredentials, providerName: string): asserts credentials is ProviderCredentials {
    if (credentials.type !== 'oauth2') throw new BadRequestError(`${providerName} requires OAuth2 credentials.`);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  protected async throwPollNotSupported(message: string): Promise<never> {
    throw new BadRequestError(message);
  }
}

export { AbstractOAuthEmailProvider };
