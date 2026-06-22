import { BadRequestError } from '@mail-otter/backend-errors';
import { AppleICloudEmailProvider } from './AppleICloudEmailProvider';
import { CustomImapEmailProvider } from './CustomImapEmailProvider';
import { FastmailEmailProvider } from './FastmailEmailProvider';
import { GmailEmailProvider } from './GmailEmailProvider';
import { OutlookEmailProvider } from './OutlookEmailProvider';
import { YahooEmailProvider } from './YahooEmailProvider';
import type { IEmailProvider } from './IEmailProvider';

const gmailProvider = new GmailEmailProvider();
const outlookProvider = new OutlookEmailProvider();
const fastmailProvider = new FastmailEmailProvider();
const yahooProvider = new YahooEmailProvider();
const customImapProvider = new CustomImapEmailProvider();
const appleICloudProvider = new AppleICloudEmailProvider();

const PROVIDERS: ReadonlyMap<string, IEmailProvider> = new Map<string, IEmailProvider>([
  [gmailProvider.providerId, gmailProvider],
  [outlookProvider.providerId, outlookProvider],
  [fastmailProvider.providerId, fastmailProvider],
  [yahooProvider.providerId, yahooProvider],
  [customImapProvider.providerId, customImapProvider],
  [appleICloudProvider.providerId, appleICloudProvider],
]);

class EmailProviderRegistry {
  public static get(providerId: string): IEmailProvider {
    const provider = PROVIDERS.get(providerId);
    if (!provider) throw new BadRequestError(`Unsupported provider: ${providerId}`);
    return provider;
  }

  public static getAll(): ReadonlyMap<string, IEmailProvider> {
    return PROVIDERS;
  }
}

export { EmailProviderRegistry };
export type { IEmailProvider };
