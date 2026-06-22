import { PROVIDER_YAHOO_MAIL } from '@mail-otter/shared/constants';
import { YahooProviderUtil } from '@mail-otter/provider-clients/yahoo';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { AnyProviderCredentials } from './IEmailProvider';
import { ImapEmailProviderBase } from './ImapEmailProviderBase';

class YahooEmailProvider extends ImapEmailProviderBase {
  public readonly providerId = PROVIDER_YAHOO_MAIL;
  protected readonly defaultImapHost = 'imap.mail.yahoo.com';
  protected readonly defaultImapPort = 993;

  protected buildImapAuth(credentials: AnyProviderCredentials): ImapConnectOptions['auth'] {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Yahoo IMAP requires OAuth2 credentials (XOAUTH2).');
    return { method: 'XOAUTH2', accessToken: credentials.accessToken };
  }

  protected resolveImapUsername(credentials: AnyProviderCredentials): string {
    if (credentials.type !== 'oauth2') throw new BadRequestError('Yahoo IMAP requires OAuth2 credentials.');
    if (!credentials.imapUsername) throw new BadRequestError('Yahoo IMAP username (providerEmail) must be provided.');
    return credentials.imapUsername;
  }

  public async getProfile(accessToken: string): Promise<{ email: string }> {
    return YahooProviderUtil.getProfile(accessToken);
  }
}

export { YahooEmailProvider };
