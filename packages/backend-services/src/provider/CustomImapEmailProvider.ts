import { PROVIDER_CUSTOM_IMAP } from '@mail-otter/shared/constants';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { AnyProviderCredentials } from './IEmailProvider';
import { ImapEmailProviderBase } from './ImapEmailProviderBase';

class CustomImapEmailProvider extends ImapEmailProviderBase {
  public readonly providerId = PROVIDER_CUSTOM_IMAP;
  protected readonly defaultImapHost = '';
  protected readonly defaultImapPort = 993;

  protected buildImapAuth(credentials: AnyProviderCredentials): ImapConnectOptions['auth'] {
    if (credentials.type === 'imap-password') {
      return { method: 'PLAIN', password: credentials.password };
    }
    if (credentials.type === 'oauth2') {
      if (!credentials.imapUsername) throw new BadRequestError('Custom IMAP with OAuth2 requires imapUsername.');
      return { method: 'XOAUTH2', accessToken: credentials.accessToken };
    }
    throw new BadRequestError('Unsupported credentials type for Custom IMAP.');
  }

  protected resolveImapHost(credentials: AnyProviderCredentials): string {
    if (credentials.type === 'imap-password') {
      if (!credentials.host) throw new BadRequestError('Custom IMAP requires imapHost to be configured.');
      return credentials.host;
    }
    throw new BadRequestError('Custom IMAP OAuth2 mode requires imapHost in application config.');
  }

  protected resolveImapUsername(credentials: AnyProviderCredentials): string {
    if (credentials.type === 'imap-password') return credentials.username;
    if (credentials.type === 'oauth2') {
      if (!credentials.imapUsername) throw new BadRequestError('Custom IMAP with OAuth2 requires imapUsername (providerEmail).');
      return credentials.imapUsername;
    }
    throw new BadRequestError('Cannot resolve IMAP username from credentials.');
  }
}

export { CustomImapEmailProvider };
