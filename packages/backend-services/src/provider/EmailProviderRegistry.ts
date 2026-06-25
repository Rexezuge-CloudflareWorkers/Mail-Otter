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
    const specific = connectionMethod ? PROVIDERS.get(`${providerId}:${connectionMethod}`) : undefined;
    const provider = specific ?? PROVIDERS.get(providerId);
    if (!provider) throw new BadRequestError(`Unsupported provider: ${providerId}`);
    return provider;
  }

  public static getAll(): ReadonlyMap<string, IEmailProvider> {
    return PROVIDERS;
  }
}

export { EmailProviderRegistry };


export {type IEmailProvider} from './IEmailProvider';