import {
  PROCESSED_MESSAGE_STATUS_SUMMARIZED,
  PROVIDER_SUBSCRIPTION_STATUS_ACTIVE,
  CONNECTION_METHOD_IMAP_PASSWORD,
} from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import { FastmailProviderUtil } from '@mail-otter/provider-clients/fastmail';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { ImapClient } from '@mail-otter/provider-clients/imap';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { GmailMessage } from '@mail-otter/provider-clients/gmail';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import type { JmapEmailResult } from '@mail-otter/provider-clients/fastmail';
import type { ImapFetchResult } from '@mail-otter/provider-clients/imap';
import type { ConnectedApplication, EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { getBackendStrings } from '@mail-otter/shared/i18n';
import { NonRetryableError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { CreatedEmailAction } from '../action';
import { EmailProcessingAuditLogger } from './EmailProcessingAuditLogger';
import { EmailFetchError, EmailMessageNotFoundError, EmailPipelineOrchestrator, classifyPipelineError } from './EmailPipeline';
import type { FetchedEmail } from './EmailPipeline';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

class EmailProcessingUtil {
  public static async resolveApplication(message: EmailQueueMessage, env: EmailProcessingEnv): Promise<ResolvedApplication> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(message.applicationId);
    if (!application) {
      throw new NonRetryableError('Connected application was not found for queued email event.');
    }
    if (!application.providerEmail && application.connectionMethod !== CONNECTION_METHOD_IMAP_PASSWORD) {
      throw new NonRetryableError('Connected application does not have a provider mailbox address.');
    }
    const accessToken: string =
      application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD
        ? ''
        : await new OAuth2AccessTokenService(env).getAccessToken(application.applicationId);
    const enabledApplicationIds: string[] = await applicationDAO.listContextEnabledApplicationIdsByUserEmail(application.userEmail);
    return { application, accessToken, enabledApplicationIds };
  }

  public static async listGmailMessages(
    application: ConnectedApplication,
    accessToken: string,
    notificationHistoryId: string,
    env: EmailProcessingEnv,
  ): Promise<GmailMessageList | null> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    if (!subscription || subscription.status !== PROVIDER_SUBSCRIPTION_STATUS_ACTIVE) return null;
    const startHistoryId: string | undefined = subscription.gmailHistoryId || notificationHistoryId;
    const history = await GmailProviderUtil.listMessageIdsSince(
      accessToken,
      startHistoryId,
      application.watchedFolders?.map((f) => f.id) ?? undefined,
    );
    return {
      messageIds: history.messageIds,
      historyId: history.historyId || notificationHistoryId,
      subscriptionId: subscription.subscriptionId,
    };
  }

  public static async updateGmailHistory(subscriptionId: string, historyId: string, env: EmailProcessingEnv): Promise<void> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    await subscriptionDAO.updateGmailHistory(subscriptionId, historyId);
  }

  public static async processGmailMessage(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<void> {
    const data: GmailSummaryData | null = await this.generateGmailSummary(
      application,
      accessToken,
      messageId,
      env,
      enabledApplicationIds,
      options,
    );
    if (data) {
      await this.sendGmailSummary(data, env);
    }
  }

  public static async processOutlookMessage(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<void> {
    const data: OutlookSummaryData | null = await this.generateOutlookSummary(
      application,
      accessToken,
      messageId,
      env,
      enabledApplicationIds,
      options,
    );
    if (data) {
      await this.sendOutlookSummary(data, env);
    }
  }

  public static async generateGmailSummary(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<GmailSummaryData | null> {
    const pipeline = new EmailPipelineOrchestrator(
      new ProcessedMessageDAO(env.DB),
      new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB)),
      env,
      enabledApplicationIds,
    );
    return pipeline.runGenerate<GmailMessage, GmailSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'rethrow',
        fetchMessage: async (): Promise<FetchedEmail<GmailMessage> | null> => {
          let message: GmailMessage;
          try {
            message = await GmailProviderUtil.getMessage(accessToken, messageId);
          } catch (error: unknown) {
            if (GmailProviderUtil.isMessageNotFoundError(error)) {
              throw new EmailMessageNotFoundError(messageId, 'Gmail message was deleted before Mail-Otter could process it.');
            }
            throw error;
          }
          const headers = message.payload?.headers;
          const subject: string = EmailContentUtil.getHeader(headers, 'Subject') || '(no subject)';
          const from: string = EmailContentUtil.getHeader(headers, 'From') || '';
          const isSummary: boolean = EmailContentUtil.getHeader(headers, 'X-Mail-Otter-Summary')?.toLowerCase() === 'true';
          if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
          const extracted = EmailContentUtil.extractGmailText(message.payload);
          const hasAttachment: boolean =
            message.payload?.parts?.some((p: { filename?: string }) => Boolean(p.filename && p.filename.length > 0)) ?? false;
          return {
            message,
            messageId: message.id,
            threadId: message.threadId,
            from,
            subject,
            body: extracted.text,
            hasAttachment,
            fingerprintInput: EmailContentUtil.getHeader(headers, 'Message-ID'),
          };
        },
      },
      {
        fetchAttachmentImages: (fetched: FetchedEmail<GmailMessage>) =>
          GmailProviderUtil.getImageAttachments(
            accessToken,
            fetched.message.id,
            fetched.message.payload,
            ConfigurationManager.attachment.getMaxSizeBytes(env),
            ConfigurationManager.attachment.getMaxPerEmail(env),
          ),
        buildResult: (fetched: FetchedEmail<GmailMessage>, result) => ({
          message: fetched.message,
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          accessToken,
          messageId,
          options,
        }),
      },
    );
  }

  public static async sendGmailSummary(data: GmailSummaryData, env: EmailProcessingEnv): Promise<void> {
    await this.sendSummaryTemplate(env, data.application, data.messageId, data.options.retryAttempt, async () => {
      await GmailProviderUtil.sendSummaryReply(data.accessToken, data.application.providerEmail!, data.message, data.summaryHtml);
    });
  }

  public static async generateOutlookSummary(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<OutlookSummaryData | null> {
    const pipeline = new EmailPipelineOrchestrator(
      new ProcessedMessageDAO(env.DB),
      new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB)),
      env,
      enabledApplicationIds,
    );
    return pipeline.runGenerate<OutlookMessage, OutlookSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'record-error',
        fetchMessage: async (): Promise<FetchedEmail<OutlookMessage> | null> => {
          let message: OutlookMessage;
          try {
            message = await OutlookProviderUtil.getMessage(accessToken, messageId);
          } catch (error: unknown) {
            if (OutlookProviderUtil.isMessageNotFoundError(error)) {
              throw new EmailMessageNotFoundError(messageId, 'Outlook message was deleted before Mail-Otter could process it.');
            }
            throw new EmailFetchError(messageId, error);
          }
          const from: string = message.from?.emailAddress?.address || message.sender?.emailAddress?.address || '';
          const subject: string = message.subject || '(no subject)';
          const isSummary: boolean =
            message.internetMessageHeaders?.some(
              (header: { name: string; value: string }): boolean =>
                header.name.toLowerCase() === 'x-mail-otter-summary' && header.value.toLowerCase() === 'true',
            ) ?? false;
          if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
          return {
            message,
            messageId: message.id,
            threadId: message.conversationId || null,
            from,
            subject,
            body: OutlookProviderUtil.getMessageText(message),
            hasAttachment: message.hasAttachments ?? false,
            fingerprintInput: message.internetMessageId,
          };
        },
      },
      {
        fetchAttachmentImages: (fetched: FetchedEmail<OutlookMessage>) =>
          OutlookProviderUtil.getImageAttachments(
            accessToken,
            fetched.message.id,
            ConfigurationManager.attachment.getMaxSizeBytes(env),
            ConfigurationManager.attachment.getMaxPerEmail(env),
          ),
        buildResult: (fetched: FetchedEmail<OutlookMessage>, result) => ({
          message: fetched.message,
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          accessToken,
          messageId,
          options,
        }),
      },
    );
  }

  public static async sendOutlookSummary(data: OutlookSummaryData, env: EmailProcessingEnv): Promise<void> {
    await this.sendSummaryTemplate(env, data.application, data.messageId, data.options.retryAttempt, async () => {
      await OutlookProviderUtil.sendSelfSummaryReply(data.accessToken, data.message, data.application.providerEmail!, data.summaryHtml);
    });
  }

  public static async generateJmapSummary(
    application: ConnectedApplication,
    accessToken: string,
    emailId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<JmapSummaryData | null> {
    const pipeline = new EmailPipelineOrchestrator(
      new ProcessedMessageDAO(env.DB),
      new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB)),
      env,
      enabledApplicationIds,
    );
    return pipeline.runGenerate<JmapEmailResult, JmapSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'rethrow',
        fetchMessage: async (): Promise<FetchedEmail<JmapEmailResult> | null> => {
          const email = await FastmailProviderUtil.getEmail(accessToken, emailId);
          const subject = email.subject ?? '(no subject)';
          const from = email.from?.[0] ? `${email.from[0].name ?? ''} <${email.from[0].email}>`.trim() : '';
          const body =
            email.textBody
              ?.map((part) => email.bodyValues?.[part.partId]?.value ?? '')
              .join('\n')
              .trim() ?? '';
          return {
            message: email,
            messageId: email.id,
            threadId: email.threadId ?? null,
            from,
            subject,
            body,
            hasAttachment: (email.attachments?.length ?? 0) > 0,
            fingerprintInput: email.messageId?.[0] ?? null,
          };
        },
      },
      {
        fetchAttachmentImages: (fetched: FetchedEmail<JmapEmailResult>) =>
          FastmailProviderUtil.downloadImageAttachments(
            accessToken,
            fetched.message,
            ConfigurationManager.attachment.getMaxSizeBytes(env),
            ConfigurationManager.attachment.getMaxPerEmail(env),
          ),
        buildResult: (fetched: FetchedEmail<JmapEmailResult>, result) => ({
          email: fetched.message,
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          accessToken,
          emailId: fetched.message.id,
          options,
        }),
      },
    );
  }

  public static async sendJmapSummary(data: JmapSummaryData, env: EmailProcessingEnv): Promise<void> {
    await this.sendSummaryTemplate(env, data.application, data.emailId, data.options.retryAttempt, async () => {
      await FastmailProviderUtil.createDraftReply(data.accessToken, data.emailId, data.summaryHtml);
    });
  }

  public static async generateImapSummary(
    application: ConnectedApplication,
    uid: number,
    imapClient: ImapClient,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<ImapSummaryData | null> {
    const pipeline = new EmailPipelineOrchestrator(
      new ProcessedMessageDAO(env.DB),
      new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB)),
      env,
      enabledApplicationIds,
    );
    return pipeline.runGenerate<ImapFetchResult, ImapSummaryData>(
      application,
      options,
      {
        fetchErrorPolicy: 'rethrow',
        fetchMessage: async (): Promise<FetchedEmail<ImapFetchResult> | null> => {
          const [headerResult] = await imapClient.fetchHeaders([uid]);
          if (!headerResult) return null;
          const subject = headerResult.subject ?? '(no subject)';
          const from = headerResult.from ?? '';
          const rawBody = await imapClient.fetchBody(uid);
          const body = EmailContentUtil.extractTextFromRaw(rawBody);
          return {
            message: headerResult,
            messageId: headerResult.messageId,
            threadId: null,
            from,
            subject,
            body,
            hasAttachment: false,
            fingerprintInput: headerResult.messageId,
          };
        },
      },
      {
        fetchAttachmentImages: (): Promise<never[]> => Promise.resolve([]),
        buildResult: (fetched: FetchedEmail<ImapFetchResult>, result) => ({
          ...result,
          emailSubject: fetched.subject,
          emailFrom: fetched.from,
          application,
          messageId: fetched.messageId,
          uid,
          options,
        }),
      },
    );
  }

  public static async sendImapSummary(data: ImapSummaryData, imapClient: ImapClient, env: EmailProcessingEnv): Promise<void> {
    await this.sendSummaryTemplate(env, data.application, data.messageId, data.options.retryAttempt, async () => {
      const summaryPrefix = getBackendStrings(data.application.contentLanguage ?? null).summary.summarySubjectPrefix;
      const summaryRfc2822 = [
        `From: ${data.application.providerEmail ?? data.application.userEmail}`,
        `To: ${data.application.providerEmail ?? data.application.userEmail}`,
        `Subject: ${summaryPrefix}${data.emailSubject}`,
        `X-Mail-Otter-Summary: true`,
        `Content-Type: text/html; charset=utf-8`,
        '',
        data.summaryHtml,
      ].join('\r\n');
      await imapClient.append('INBOX', summaryRfc2822);
    });
  }

  private static async sendSummaryTemplate(
    env: EmailProcessingEnv,
    application: ConnectedApplication,
    messageId: string,
    retryAttempt: number | undefined,
    send: () => Promise<void>,
  ): Promise<void> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const existing = await processedDAO.getByMessageId(application.applicationId, messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) return;
    try {
      await send();
      await auditLogger.logSummarySent(application, messageId, retryAttempt);
      await processedDAO.markSummarized(application.applicationId, messageId);
    } catch (error: unknown) {
      const processingError = this.classifyError(error);
      await processedDAO.markError(application.applicationId, messageId, processingError.message);
      await auditLogger.logProcessingError(application, messageId, processingError, retryAttempt);
      throw processingError;
    }
  }

  private static classifyError(error: unknown): Error {
    return classifyPipelineError(error);
  }
}

interface ResolvedApplication {
  application: ConnectedApplication;
  accessToken: string;
  enabledApplicationIds: string[];
}

interface GmailMessageList {
  messageIds: string[];
  historyId: string;
  subscriptionId: string;
}

interface EmailProcessingEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  AI_SUMMARY_MODEL?: string;
  AI_SUMMARY_FALLBACK_MODEL?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  AI_EMBEDDING_MODEL?: string;
  MAX_EMAIL_BODY_CHARS?: string;
  DEBUG_MODE?: string;
  MAX_CONTEXT_MEMORY_CHARS?: string;
  MAX_RAG_CONTEXT_CHARS?: string;
  RAG_TOP_K?: string;
  RAG_VECTOR_QUERY_TOP_K?: string;
  ACTION_CALLBACK_BASE_URL?: string;
  ACTION_DEFAULT_EXPIRY_HOURS?: string;
  ATTACHMENT_VISION_ENABLED?: string;
  ATTACHMENT_VISION_MODEL?: string;
  MAX_ATTACHMENT_SIZE_BYTES?: string;
  MAX_ATTACHMENTS_PER_EMAIL?: string;
}

interface EmailProcessingOptions {
  retryAttempt?: number;
  callbackBaseUrl?: string;
}

interface GmailSummaryData {
  message: GmailMessage;
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  messageId: string;
  options: EmailProcessingOptions;
}

interface OutlookSummaryData {
  message: OutlookMessage;
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  messageId: string;
  options: EmailProcessingOptions;
}

interface JmapSummaryData {
  email: { id: string; subject?: string | null; from?: Array<{ email: string; name?: string }> | null; threadId?: string | null };
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  emailId: string;
  options: EmailProcessingOptions;
}

interface ImapSummaryData {
  summaryHtml: string;
  summaryModel: string;
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  messageId: string;
  uid: number;
  options: EmailProcessingOptions;
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
