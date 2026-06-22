import { PROVIDER_APPLE_ICLOUD } from '@mail-otter/shared/constants';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { AnyProviderCredentials } from './IEmailProvider';
import { ImapEmailProviderBase } from './ImapEmailProviderBase';

class AppleICloudEmailProvider extends ImapEmailProviderBase {
  public readonly providerId = PROVIDER_APPLE_ICLOUD;
  protected readonly defaultImapHost = 'imap.mail.me.com';
  protected readonly defaultImapPort = 993;

  protected buildImapAuth(credentials: AnyProviderCredentials): ImapConnectOptions['auth'] {
    if (credentials.type !== 'imap-password') {
      throw new BadRequestError('Apple iCloud Mail requires an app-specific password (imap-password connection method).');
    }
    return { method: 'PLAIN', password: credentials.password };
  }

  protected resolveImapUsername(credentials: AnyProviderCredentials): string {
    if (credentials.type !== 'imap-password') throw new BadRequestError('Apple iCloud requires imap-password credentials.');
    return credentials.username;
  }

  protected resolveImapHost(_credentials: AnyProviderCredentials): string {
    return this.defaultImapHost;
  }

  protected resolveImapPort(_credentials: AnyProviderCredentials): number {
    return this.defaultImapPort;
  }
}

export { AppleICloudEmailProvider };
