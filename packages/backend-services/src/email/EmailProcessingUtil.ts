import { PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROVIDER_SUBSCRIPTION_STATUS_ACTIVE, CONNECTION_METHOD_IMAP_PASSWORD } from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import { FastmailProviderUtil } from '@mail-otter/provider-clients/fastmail';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { ImapClient } from '@mail-otter/provider-clients/imap';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { GmailMessage } from '@mail-otter/provider-clients/gmail';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import type { ProviderImageAttachment } from '@mail-otter/provider-clients';
import type { ConnectedApplication, EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { BadRequestError, NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import { CryptoUtil } from '@mail-otter/shared/utils';
import type { ProviderId } from '@mail-otter/shared/constants';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { CreatedEmailAction } from '../action';
import { EmailProcessingAuditLogger } from './EmailProcessingAuditLogger';
import { EmailSummaryOrchestrator } from './EmailSummaryOrchestrator';
import { WorkersAiErrorUtil } from './WorkersAiErrorUtil';
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
    const accessToken: string = application.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD
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
    const history = await GmailProviderUtil.listMessageIdsSince(accessToken, startHistoryId, application.watchedFolders?.map((f) => f.id) ?? undefined);
    return { messageIds: history.messageIds, historyId: history.historyId || notificationHistoryId, subscriptionId: subscription.subscriptionId };
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
      application, accessToken, messageId, env, enabledApplicationIds, options,
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
      application, accessToken, messageId, env, enabledApplicationIds, options,
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
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    let message: GmailMessage;
    try {
      message = await GmailProviderUtil.getMessage(accessToken, messageId);
    } catch (error: unknown) {
      if (GmailProviderUtil.isMessageNotFoundError(error)) {
        const started = await processedDAO.tryStart(application.applicationId, application.providerId, messageId, null, {
          allowExistingForRetry: this.isRetryAttempt(options),
        });
        if (!started) return null;
        await processedDAO.markSkipped(application.applicationId, messageId, 'Gmail message was deleted before Mail-Otter could process it.');
        return null;
      }
      throw error;
    }
    const headers = message.payload?.headers;
    const subject: string = EmailContentUtil.getHeader(headers, 'Subject') || '(no subject)';
    const from: string = EmailContentUtil.getHeader(headers, 'From') || '';
    const isSummary: boolean = EmailContentUtil.getHeader(headers, 'X-Mail-Otter-Summary')?.toLowerCase() === 'true';
    const stableMessageFingerprint: string | null = await this.getStableMessageFingerprint(
      env, application.providerId, EmailContentUtil.getHeader(headers, 'Message-ID'),
    );
    if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
    const started: boolean = await processedDAO.tryStart(application.applicationId, application.providerId, message.id, message.threadId, {
      allowExistingForRetry: this.isRetryAttempt(options),
      providerStableMessageFingerprint: stableMessageFingerprint,
    });
    if (!started) return null;
    await auditLogger.logProcessingStarted(application, message.id, options.retryAttempt);
    try {
      const extracted = EmailContentUtil.extractGmailText(message.payload);
      const hasAttachment: boolean = message.payload?.parts?.some(
        (p: { filename?: string }) => Boolean(p.filename && p.filename.length > 0),
      ) ?? false;
      const attachmentImages: ProviderImageAttachment[] = hasAttachment && ConfigurationManager.ai.isAttachmentVisionEnabled(env)
        ? await GmailProviderUtil.getImageAttachments(
            accessToken, message.id, message.payload,
            ConfigurationManager.attachment.getMaxSizeBytes(env),
            ConfigurationManager.attachment.getMaxPerEmail(env),
          ).catch((err: unknown) => { console.warn('[EmailProcessingUtil] Gmail attachment fetch failed:', err); return []; })
        : [];
      const orchestrator = new EmailSummaryOrchestrator(auditLogger, processedDAO, env, enabledApplicationIds);
      const result = await orchestrator.orchestrate(application, message.id, from, subject, extracted.text, message.threadId, options, hasAttachment, attachmentImages);
      if (!result) return null;
      return { message, ...result, emailSubject: subject, emailFrom: from, application, accessToken, messageId, options };
    } catch (error: unknown) {
      const processingError: Error = this.classifyError(error);
      await processedDAO.markError(application.applicationId, message.id, processingError.message);
      await auditLogger.logProcessingError(application, message.id, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public static async sendGmailSummary(data: GmailSummaryData, env: EmailProcessingEnv): Promise<void> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const existing = await processedDAO.getByMessageId(data.application.applicationId, data.messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) return;
    try {
      await GmailProviderUtil.sendSummaryReply(data.accessToken, data.application.providerEmail!, data.message, data.summaryHtml);
      await auditLogger.logSummarySent(data.application, data.messageId, data.options.retryAttempt);
      await processedDAO.markSummarized(data.application.applicationId, data.messageId);
    } catch (error: unknown) {
      const processingError: Error = this.classifyError(error);
      await processedDAO.markError(data.application.applicationId, data.messageId, processingError.message);
      await auditLogger.logProcessingError(data.application, data.messageId, processingError, data.options.retryAttempt);
      throw processingError;
    }
  }

  public static async generateOutlookSummary(
    application: ConnectedApplication,
    accessToken: string,
    messageId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<OutlookSummaryData | null> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    let message: OutlookMessage;
    try {
      message = await OutlookProviderUtil.getMessage(accessToken, messageId);
    } catch (error: unknown) {
      if (OutlookProviderUtil.isMessageNotFoundError(error)) {
        const started = await processedDAO.tryStart(application.applicationId, application.providerId, messageId, null, {
          allowExistingForRetry: this.isRetryAttempt(options),
        });
        if (!started) return null;
        await processedDAO.markSkipped(application.applicationId, messageId, 'Outlook message was deleted before Mail-Otter could process it.');
        return null;
      }
      const processingError: Error = this.classifyError(error);
      const started = await processedDAO.tryStart(application.applicationId, application.providerId, messageId, null, {
        allowExistingForRetry: this.isRetryAttempt(options),
      });
      if (!started) return null;
      await processedDAO.markError(application.applicationId, messageId, processingError.message);
      throw processingError;
    }

    const from: string = message.from?.emailAddress?.address || message.sender?.emailAddress?.address || '';
    const subject: string = message.subject || '(no subject)';
    const isSummary: boolean =
      message.internetMessageHeaders?.some(
        (header: { name: string; value: string }): boolean =>
          header.name.toLowerCase() === 'x-mail-otter-summary' && header.value.toLowerCase() === 'true',
      ) ?? false;
    if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
    const stableMessageFingerprint: string | null = await this.getStableMessageFingerprint(env, application.providerId, message.internetMessageId);
    const started: boolean = await processedDAO.tryStart(application.applicationId, application.providerId, message.id, message.conversationId || null, {
      allowExistingForRetry: this.isRetryAttempt(options),
      providerStableMessageFingerprint: stableMessageFingerprint,
    });
    if (!started) return null;
    await auditLogger.logProcessingStarted(application, message.id, options.retryAttempt);
    try {
      const body: string = OutlookProviderUtil.getMessageText(message);
      const hasAttachment: boolean = message.hasAttachments ?? false;
      const attachmentImages: ProviderImageAttachment[] = hasAttachment && ConfigurationManager.ai.isAttachmentVisionEnabled(env)
        ? await OutlookProviderUtil.getImageAttachments(
            accessToken, message.id,
            ConfigurationManager.attachment.getMaxSizeBytes(env),
            ConfigurationManager.attachment.getMaxPerEmail(env),
          ).catch((err: unknown) => { console.warn('[EmailProcessingUtil] Outlook attachment fetch failed:', err); return []; })
        : [];
      const orchestrator = new EmailSummaryOrchestrator(auditLogger, processedDAO, env, enabledApplicationIds);
      const result = await orchestrator.orchestrate(application, message.id, from, subject, body, message.conversationId || null, options, hasAttachment, attachmentImages);
      if (!result) return null;
      return { message, ...result, emailSubject: subject, emailFrom: from, application, accessToken, messageId, options };
    } catch (error: unknown) {
      const processingError: Error = this.classifyError(error);
      await processedDAO.markError(application.applicationId, message.id, processingError.message);
      await auditLogger.logProcessingError(application, message.id, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public static async sendOutlookSummary(data: OutlookSummaryData, env: EmailProcessingEnv): Promise<void> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const existing = await processedDAO.getByMessageId(data.application.applicationId, data.messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) return;
    try {
      await OutlookProviderUtil.sendSelfSummaryReply(data.accessToken, data.message, data.application.providerEmail!, data.summaryHtml);
      await auditLogger.logSummarySent(data.application, data.messageId, data.options.retryAttempt);
      await processedDAO.markSummarized(data.application.applicationId, data.messageId);
    } catch (error: unknown) {
      const processingError: Error = this.classifyError(error);
      await processedDAO.markError(data.application.applicationId, data.messageId, processingError.message);
      await auditLogger.logProcessingError(data.application, data.messageId, processingError, data.options.retryAttempt);
      throw processingError;
    }
  }

  public static async generateJmapSummary(
    application: ConnectedApplication,
    accessToken: string,
    emailId: string,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<JmapSummaryData | null> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const email = await FastmailProviderUtil.getEmail(accessToken, emailId);
    const subject = email.subject ?? '(no subject)';
    const from = email.from?.[0] ? `${email.from[0].name ?? ''} <${email.from[0].email}>`.trim() : '';
    const body = email.textBody
      ?.map((part) => email.bodyValues?.[part.partId]?.value ?? '')
      .join('\n')
      .trim() ?? '';
    const stableFingerprint = email.messageId?.[0] ?? null;
    const stableFingerprintHash = stableFingerprint
      ? await this.getStableMessageFingerprint(env, application.providerId, stableFingerprint)
      : null;
    const started = await processedDAO.tryStart(application.applicationId, application.providerId, email.id, email.threadId ?? null, {
      allowExistingForRetry: this.isRetryAttempt(options),
      providerStableMessageFingerprint: stableFingerprintHash,
    });
    if (!started) return null;
    await auditLogger.logProcessingStarted(application, email.id, options.retryAttempt);
    try {
      const hasAttachment: boolean = (email.attachments?.length ?? 0) > 0;
      const attachmentImages: ProviderImageAttachment[] = hasAttachment && ConfigurationManager.ai.isAttachmentVisionEnabled(env)
        ? await FastmailProviderUtil.downloadImageAttachments(
            accessToken, email,
            ConfigurationManager.attachment.getMaxSizeBytes(env),
            ConfigurationManager.attachment.getMaxPerEmail(env),
          ).catch((err: unknown) => { console.warn('[EmailProcessingUtil] Fastmail attachment fetch failed:', err); return []; })
        : [];
      const orchestrator = new EmailSummaryOrchestrator(auditLogger, processedDAO, env, enabledApplicationIds);
      const result = await orchestrator.orchestrate(application, email.id, from, subject, body, email.threadId ?? null, options, hasAttachment, attachmentImages);
      if (!result) return null;
      return { email, ...result, emailSubject: subject, emailFrom: from, application, accessToken, emailId: email.id, options };
    } catch (error: unknown) {
      const processingError = this.classifyError(error);
      await processedDAO.markError(application.applicationId, email.id, processingError.message);
      await auditLogger.logProcessingError(application, email.id, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public static async sendJmapSummary(data: JmapSummaryData, env: EmailProcessingEnv): Promise<void> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const existing = await processedDAO.getByMessageId(data.application.applicationId, data.emailId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) return;
    try {
      await FastmailProviderUtil.createDraftReply(data.accessToken, data.emailId, data.summaryHtml);
      await auditLogger.logSummarySent(data.application, data.emailId, data.options.retryAttempt);
      await processedDAO.markSummarized(data.application.applicationId, data.emailId);
    } catch (error: unknown) {
      const processingError = this.classifyError(error);
      await processedDAO.markError(data.application.applicationId, data.emailId, processingError.message);
      await auditLogger.logProcessingError(data.application, data.emailId, processingError, data.options.retryAttempt);
      throw processingError;
    }
  }

  public static async generateImapSummary(
    application: ConnectedApplication,
    uid: number,
    imapClient: ImapClient,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions = {},
  ): Promise<ImapSummaryData | null> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const [headerResult] = await imapClient.fetchHeaders([uid]);
    if (!headerResult) return null;
    const subject = headerResult.subject ?? '(no subject)';
    const from = headerResult.from ?? '';
    const rawBody = await imapClient.fetchBody(uid);
    const body = EmailContentUtil.extractTextFromRaw(rawBody);
    const resolvedMessageId = headerResult.messageId;
    const stableFingerprintHash = await this.getStableMessageFingerprint(env, application.providerId, headerResult.messageId);
    const started = await processedDAO.tryStart(application.applicationId, application.providerId, resolvedMessageId, null, {
      allowExistingForRetry: this.isRetryAttempt(options),
      providerStableMessageFingerprint: stableFingerprintHash,
    });
    if (!started) return null;
    await auditLogger.logProcessingStarted(application, resolvedMessageId, options.retryAttempt);
    try {
      const orchestrator = new EmailSummaryOrchestrator(auditLogger, processedDAO, env, enabledApplicationIds);
      const result = await orchestrator.orchestrate(application, resolvedMessageId, from, subject, body, null, options);
      if (!result) return null;
      return { ...result, emailSubject: subject, emailFrom: from, application, messageId: resolvedMessageId, uid, options };
    } catch (error: unknown) {
      const processingError = this.classifyError(error);
      await processedDAO.markError(application.applicationId, resolvedMessageId, processingError.message);
      await auditLogger.logProcessingError(application, resolvedMessageId, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public static async sendImapSummary(data: ImapSummaryData, imapClient: ImapClient, env: EmailProcessingEnv): Promise<void> {
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const auditLogger = new EmailProcessingAuditLogger(new ApplicationContextDAO(env.DB));
    const existing = await processedDAO.getByMessageId(data.application.applicationId, data.messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) return;
    try {
      const summaryRfc2822 = [
        `From: ${data.application.providerEmail ?? data.application.userEmail}`,
        `To: ${data.application.providerEmail ?? data.application.userEmail}`,
        `Subject: [Mail-Otter Summary] ${data.emailSubject}`,
        `X-Mail-Otter-Summary: true`,
        `Content-Type: text/html; charset=utf-8`,
        '',
        data.summaryHtml,
      ].join('\r\n');
      await imapClient.append('INBOX', summaryRfc2822);
      await auditLogger.logSummarySent(data.application, data.messageId, data.options.retryAttempt);
      await processedDAO.markSummarized(data.application.applicationId, data.messageId);
    } catch (error: unknown) {
      const processingError = this.classifyError(error);
      await processedDAO.markError(data.application.applicationId, data.messageId, processingError.message);
      await auditLogger.logProcessingError(data.application, data.messageId, processingError, data.options.retryAttempt);
      throw processingError;
    }
  }

  private static isRetryAttempt(options: EmailProcessingOptions): boolean {
    return typeof options.retryAttempt === 'number' && options.retryAttempt > 1;
  }

  private static async getStableMessageFingerprint(
    env: EmailProcessingEnv,
    providerId: ProviderId,
    stableMessageId: string | undefined,
  ): Promise<string | null> {
    const normalizedStableMessageId: string = stableMessageId?.trim() || '';
    if (!normalizedStableMessageId) return null;
    const secret: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    return CryptoUtil.hmacSha256Hex(`provider-stable-message-id\n${providerId}\n${normalizedStableMessageId}`, secret);
  }

  private static classifyError(error: unknown): Error {
    if (error instanceof RetryableError || error instanceof NonRetryableError) {
      return error;
    }
    if (WorkersAiErrorUtil.isDailyFreeAllocationError(error)) {
      return new NonRetryableError(WorkersAiErrorUtil.getDailyFreeAllocationMessage());
    }
    if (error instanceof BadRequestError) {
      return new NonRetryableError(error.message);
    }
    if (error instanceof Error) {
      return new RetryableError(error.message);
    }
    return new RetryableError(String(error));
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
export type { EmailProcessingEnv, EmailProcessingOptions, ImapSummaryData, JmapSummaryData, ResolvedApplication, GmailMessageList, GmailSummaryData, OutlookSummaryData };
