import { BadRequestError } from '@mail-otter/backend-errors';
import { AppleICloudEmailProvider } from './AppleICloudEmailProvider';
import { CustomImapEmailProvider } from './CustomImapEmailProvider';
import { FastmailEmailProvider } from './FastmailEmailProvider';
import { FastmailImapEmailProvider } from './FastmailImapEmailProvider';
import { GmailEmailProvider } from './GmailEmailProvider';
import { GmailImapEmailProvider } from './GmailImapEmailProvider';
import { OutlookEmailProvider } from './OutlookEmailProvider';
import { OutlookImapEmailProvider } from './OutlookImapEmailProvider';
import { YahooEmailProvider } from './YahooEmailProvider';
import type { IEmailProvider } from './IEmailProvider';

const gmailProvider = new GmailEmailProvider();
const gmailImapProvider = new GmailImapEmailProvider();
const outlookProvider = new OutlookEmailProvider();
const outlookImapProvider = new OutlookImapEmailProvider();
const fastmailProvider = new FastmailEmailProvider();
const fastmailImapProvider = new FastmailImapEmailProvider();
const yahooProvider = new YahooEmailProvider();
const customImapProvider = new CustomImapEmailProvider();
const appleICloudProvider = new AppleICloudEmailProvider();

const PROVIDERS: ReadonlyMap<string, IEmailProvider> = new Map<string, IEmailProvider>([
  [gmailProvider.providerId, gmailProvider],
  [`${gmailImapProvider.providerId}:imap-password`, gmailImapProvider],
  [outlookProvider.providerId, outlookProvider],
  [`${outlookImapProvider.providerId}:imap-password`, outlookImapProvider],
  [fastmailProvider.providerId, fastmailProvider],
  [`${fastmailImapProvider.providerId}:imap-password`, fastmailImapProvider],
  [yahooProvider.providerId, yahooProvider],
  [customImapProvider.providerId, customImapProvider],
  [appleICloudProvider.providerId, appleICloudProvider],
]);

class EmailProviderRegistry {
  public static get(providerId: string, connectionMethod?: string): IEmailProvider {
    return resolveEmailProvider(PROVIDERS, providerId, connectionMethod);
  }

  public static getAll(): ReadonlyMap<string, IEmailProvider> {
    return PROVIDERS;
  }
}

type ProviderMap = ReadonlyMap<string, IEmailProvider>;

function getEmailProviderRegistryKey(providerId: string, connectionMethod?: string): string {
  return connectionMethod ? `${providerId}:${connectionMethod}` : providerId;
}

function resolveEmailProvider(registry: ProviderMap, providerId: string, connectionMethod?: string): IEmailProvider {
  const specific = connectionMethod ? registry.get(getEmailProviderRegistryKey(providerId, connectionMethod)) : undefined;
  const provider = specific ?? registry.get(providerId);
  if (!provider) throw new BadRequestError(`Unsupported provider: ${providerId}`);
  return provider;
}

function createEmailProviderRegistry(
  overrides?: ReadonlyMap<string, IEmailProvider> | Readonly<Record<string, IEmailProvider>>,
): Map<string, IEmailProvider> {
  const registry = new Map<string, IEmailProvider>(PROVIDERS);
  if (overrides) {
    const entries: Iterable<readonly [string, IEmailProvider]> = overrides instanceof Map ? overrides.entries() : Object.entries(overrides);
    for (const [key, provider] of entries) {
      registry.set(key, provider);
    }
  }
  return registry;
}

export { EmailProviderRegistry, createEmailProviderRegistry, getEmailProviderRegistryKey, resolveEmailProvider };
export type { ProviderMap };

export { type IEmailProvider } from './IEmailProvider';
