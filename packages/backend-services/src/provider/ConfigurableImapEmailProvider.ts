import { BadRequestError } from '@mail-otter/backend-errors';
import type { ImapConnectOptions } from '@mail-otter/provider-clients/imap';
import type { AnyProviderCredentials } from './IEmailProvider';
import { ImapEmailProviderBase } from './ImapEmailProviderBase';

interface ImapProviderConfig {
  providerId: string;
  host: string;
  port: number;
  noun: string;
}

// Factory/Strategy base for PLAIN-password IMAP providers.
// Replaces ~28 LOC copy-pasted across Gmail/Outlook/Fastmail/Apple subclasses
// with a single configurable implementation.
class ConfigurableImapEmailProvider extends ImapEmailProviderBase {
  public readonly providerId: string;
  protected readonly defaultImapHost: string;
  protected readonly defaultImapPort: number;
  private readonly noun: string;

  constructor(config: ImapProviderConfig) {
    super();
    this.providerId = config.providerId;
    this.defaultImapHost = config.host;
    this.defaultImapPort = config.port;
    this.noun = config.noun;
  }

  protected buildImapAuth(credentials: AnyProviderCredentials): ImapConnectOptions['auth'] {
    if (credentials.type !== 'imap-password') {
      throw new BadRequestError(`${this.noun} IMAP requires an app password (imap-password connection method).`);
    }
    return { method: 'PLAIN', password: credentials.password };
  }

  protected resolveImapUsername(credentials: AnyProviderCredentials): string {
    if (credentials.type !== 'imap-password') {
      throw new BadRequestError(`${this.noun} IMAP requires imap-password credentials.`);
    }
    return credentials.username;
  }

  protected override resolveImapHost(_credentials: AnyProviderCredentials): string {
    return this.defaultImapHost;
  }

  protected override resolveImapPort(_credentials: AnyProviderCredentials): number {
    return this.defaultImapPort;
  }
}

export { ConfigurableImapEmailProvider };
export type { ImapProviderConfig };
