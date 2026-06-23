import { PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { AnyProviderCredentials } from './IEmailProvider';
import { ImapEmailProviderBase } from './ImapEmailProviderBase';

class OutlookImapEmailProvider extends ImapEmailProviderBase {
  public readonly providerId = PROVIDER_MICROSOFT_OUTLOOK;
  protected readonly defaultImapHost = 'outlook.office365.com';
  protected readonly defaultImapPort = 993;

  protected buildImapAuth(credentials: AnyProviderCredentials): ImapConnectOptions['auth'] {
    if (credentials.type !== 'imap-password') {
      throw new BadRequestError('Outlook IMAP requires an app password (imap-password connection method).');
    }
    return { method: 'PLAIN', password: credentials.password };
  }

  protected resolveImapUsername(credentials: AnyProviderCredentials): string {
    if (credentials.type !== 'imap-password') throw new BadRequestError('Outlook IMAP requires imap-password credentials.');
    return credentials.username;
  }

  protected resolveImapHost(_credentials: AnyProviderCredentials): string {
    return this.defaultImapHost;
  }

  protected resolveImapPort(_credentials: AnyProviderCredentials): number {
    return this.defaultImapPort;
  }
}

export { OutlookImapEmailProvider };
