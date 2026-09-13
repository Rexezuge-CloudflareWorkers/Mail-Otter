import type { ImapClient } from '@mail-otter/provider-clients/imap';
import type { ConnectedApplication, EmailQueueMessage } from '@mail-otter/shared/model';
import { EmailApplicationResolver } from './processing/EmailApplicationResolver';
import { GmailMessageProcessor } from './processing/GmailMessageProcessor';
import { OutlookMessageProcessor } from './processing/OutlookMessageProcessor';
import { JmapMessageProcessor } from './processing/JmapMessageProcessor';
import { ImapMessageProcessor } from './processing/ImapMessageProcessor';
import type {
  EmailProcessingEnv,
  EmailProcessingOptions,
  GmailMessageList,
  GmailSummaryData,
  ImapSummaryData,
  JmapSummaryData,
  OutlookSummaryData,
  ResolvedApplication,
} from './processing/EmailProcessingTypes';

/**
 * Thin backward-compatible facade over the `processing/` Strategy split.
 *
 * New code should import the focused processors directly
 * (`EmailApplicationResolver`, `Gmail|Outlook|Jmap|ImapMessageProcessor`,
 * `SummaryDeliveryService`) instead of this god-class. This facade remains so
 * the workflow, tasks, and existing tests keep working during migration.
 *
 * @deprecated Prefer per-provider processors + `IEmailProvider` registry.
 */
class EmailProcessingUtil {
  public static resolveApplication(message: EmailQueueMessage, env: EmailProcessingEnv): Promise<ResolvedApplication> {
    return new EmailApplicationResolver(env).resolveApplication(message);
  }

  public static listGmailMessages(
    application: ConnectedApplication,
    accessToken: string,
    notificationHistoryId: string,
    env: EmailProcessingEnv,
  ): Promise<GmailMessageList | null> {
    return new EmailApplicationResolver(env).listGmailMessages(application, accessToken, notificationHistoryId);
  }

  public static updateGmailHistory(subscriptionId: string, historyId: string, env: EmailProcessingEnv): Promise<void> {
    return new EmailApplicationResolver(env).updateGmailHistory(subscriptionId, historyId);
  }

  public static processGmailMessage(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<void> {
    return new GmailMessageProcessor(env).processMessage(application, accessToken, messageId, enabledApplicationIds, options);
  }

  public static processOutlookMessage(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<void> {
    return new OutlookMessageProcessor(env).processMessage(application, accessToken, messageId, enabledApplicationIds, options);
  }

  public static generateGmailSummary(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<GmailSummaryData | null> {
    return new GmailMessageProcessor(env).generateSummary(application, accessToken, messageId, enabledApplicationIds, options);
  }

  public static sendGmailSummary(data: GmailSummaryData, env: EmailProcessingEnv): Promise<void> {
    return new GmailMessageProcessor(env).sendSummary(data);
  }

  public static generateOutlookSummary(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<OutlookSummaryData | null> {
    return new OutlookMessageProcessor(env).generateSummary(application, accessToken, messageId, enabledApplicationIds, options);
  }

  public static sendOutlookSummary(data: OutlookSummaryData, env: EmailProcessingEnv): Promise<void> {
    return new OutlookMessageProcessor(env).sendSummary(data);
  }

  public static generateJmapSummary(
    application: ConnectedApplication,
    accessToken: string,
    emailId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<JmapSummaryData | null> {
    return new JmapMessageProcessor(env).generateSummary(application, accessToken, emailId, enabledApplicationIds, options);
  }

  public static sendJmapSummary(data: JmapSummaryData, env: EmailProcessingEnv): Promise<void> {
    return new JmapMessageProcessor(env).sendSummary(data);
  }

  public static generateImapSummary(
    application: ConnectedApplication,
    uid: number,
    imapClient: ImapClient,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<ImapSummaryData | null> {
    return new ImapMessageProcessor(env).generateSummary(application, uid, imapClient, enabledApplicationIds, options);
  }

  public static sendImapSummary(data: ImapSummaryData, imapClient: ImapClient, env: EmailProcessingEnv): Promise<void> {
    return new ImapMessageProcessor(env).sendSummary(data, imapClient);
  }
}

export { EmailProcessingUtil };
export type {
  EmailProcessingEnv,
  EmailProcessingOptions,
  ImapSummaryData,
  JmapSummaryData,
  ResolvedApplication,
  GmailMessageList,
  GmailSummaryData,
  OutlookSummaryData,
};
