import { PROCESSED_MESSAGE_STATUS_SUMMARIZED, PROVIDER_SUBSCRIPTION_STATUS_ACTIVE, SOURCE_TYPE_EMAIL, CONTEXT_AUDIT_EVENT_PROCESSING_STARTED, CONTEXT_AUDIT_EVENT_SUMMARY_GENERATED, CONTEXT_AUDIT_EVENT_SUMMARY_SENT, CONTEXT_AUDIT_EVENT_ACTION_CREATED, CONTEXT_AUDIT_EVENT_ERROR, CONTEXT_AUDIT_LOG_SEVERITY_INFO, CONTEXT_AUDIT_LOG_SEVERITY_WARNING, CONTEXT_AUDIT_LOG_SEVERITY_ERROR } from '@mail-otter/shared/constants';
import { AiDailyUsageDAO, ApplicationContextDAO, ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { GmailMessage } from '@mail-otter/provider-clients/gmail';
import type { OutlookMessage } from '@mail-otter/provider-clients/outlook';
import type { ConnectedApplication, EmailActionProposal, EmailQueueMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { AiSummaryRetryableError, BadRequestError, NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { CryptoUtil } from '@mail-otter/shared/utils';
import type { ProviderId } from '@mail-otter/shared/constants';
import { ActionService } from '../action';
import type { CreatedEmailAction } from '../action';
import { EmailContextUtil } from './EmailContextUtil';
import { EmailRulesUtil } from './EmailRulesUtil';
import { SenderFilterUtil } from './SenderFilterUtil';
import { EmailSummaryUtil, type AiTextGenerationUsage, type EmailSummaryResult } from './EmailSummaryUtil';
import { AiUsageUtil, type AiTextGenerationUsageEstimate } from './AiUsageUtil';
import { WorkersAiErrorUtil } from './WorkersAiErrorUtil';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';

const EMAIL_SUMMARY_MAX_COMPLETION_TOKENS = 1200;

class EmailProcessingUtil {
  public static async resolveApplication(message: EmailQueueMessage, env: EmailProcessingEnv): Promise<ResolvedApplication> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(message.applicationId);
    if (!application) {
      throw new NonRetryableError('Connected application was not found for queued email event.');
    }
    if (!application.providerEmail) {
      throw new NonRetryableError('Connected application does not have a provider mailbox address.');
    }
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
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
    const data: GmailSummaryData | null = await EmailProcessingUtil.generateGmailSummary(
      application, accessToken, messageId, env, enabledApplicationIds, options,
    );
    if (data) {
      await EmailProcessingUtil.sendGmailSummary(data, env);
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
    const data: OutlookSummaryData | null = await EmailProcessingUtil.generateOutlookSummary(
      application, accessToken, messageId, env, enabledApplicationIds, options,
    );
    if (data) {
      await EmailProcessingUtil.sendOutlookSummary(data, env);
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
    const message: GmailMessage = await GmailProviderUtil.getMessage(accessToken, messageId);
    const headers = message.payload?.headers;
    const subject: string = EmailContentUtil.getHeader(headers, 'Subject') || '(no subject)';
    const from: string = EmailContentUtil.getHeader(headers, 'From') || '';
    const isSummary: boolean = EmailContentUtil.getHeader(headers, 'X-Mail-Otter-Summary')?.toLowerCase() === 'true';
    const stableMessageFingerprint: string | null = await EmailProcessingUtil.getStableMessageFingerprint(
      env, application.providerId, EmailContentUtil.getHeader(headers, 'Message-ID'),
    );
    const contextDAO = new ApplicationContextDAO(env.DB);
    const processedDAO = new ProcessedMessageDAO(env.DB);
    if (isSummary || EmailContentUtil.isFromMailbox(from, application.providerEmail)) return null;
    const started: boolean = await processedDAO.tryStart(application.applicationId, application.providerId, message.id, message.threadId, {
      allowExistingForRetry: EmailProcessingUtil.isRetryAttempt(options),
      providerStableMessageFingerprint: stableMessageFingerprint,
    });
    if (!started) return null;
    await EmailProcessingUtil.logProcessingStarted(contextDAO, application, message.id, options.retryAttempt);
    try {
      const extracted = EmailContentUtil.extractGmailText(message.payload);
      const result = await EmailProcessingUtil.generateSummaryCore(
        contextDAO, processedDAO, application, message.id,
        from, subject, extracted.text, message.threadId, env, enabledApplicationIds, options,
      );
      if (!result) return null;
      return { message, ...result, emailSubject: subject, emailFrom: from, application, accessToken, messageId, options };
    } catch (error: unknown) {
      const processingError: Error = EmailProcessingUtil.classifyError(error);
      await processedDAO.markError(application.applicationId, message.id, EmailProcessingUtil.formatError(processingError));
      await EmailProcessingUtil.logProcessingError(contextDAO, application, message.id, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public static async sendGmailSummary(data: GmailSummaryData, env: EmailProcessingEnv): Promise<void> {
    const contextDAO = new ApplicationContextDAO(env.DB);
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const existing = await processedDAO.getByMessageId(data.application.applicationId, data.messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) {
      return;
    }
    try {
      await GmailProviderUtil.sendSummaryReply(data.accessToken, data.application.providerEmail!, data.message, data.summaryHtml);
      await EmailProcessingUtil.logSummarySent(contextDAO, data.application, data.messageId, data.options.retryAttempt);
      await processedDAO.markSummarized(data.application.applicationId, data.messageId);
    } catch (error: unknown) {
      const processingError: Error = EmailProcessingUtil.classifyError(error);
      await processedDAO.markError(data.application.applicationId, data.messageId, EmailProcessingUtil.formatError(processingError));
      await EmailProcessingUtil.logProcessingError(contextDAO, data.application, data.messageId, processingError, data.options.retryAttempt);
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
    const contextDAO = new ApplicationContextDAO(env.DB);
    const processedDAO = new ProcessedMessageDAO(env.DB);
    let message: OutlookMessage;
    try {
      message = await OutlookProviderUtil.getMessage(accessToken, messageId);
    } catch (error: unknown) {
      if (OutlookProviderUtil.isMessageNotFoundError(error)) {
        const started = await processedDAO.tryStart(application.applicationId, application.providerId, messageId, null, {
          allowExistingForRetry: EmailProcessingUtil.isRetryAttempt(options),
        });
        if (!started) return null;
        await processedDAO.markSkipped(application.applicationId, messageId, 'Outlook message was deleted before Mail-Otter could process it.');
        return null;
      }
      const processingError: Error = EmailProcessingUtil.classifyError(error);
      const started = await processedDAO.tryStart(application.applicationId, application.providerId, messageId, null, {
        allowExistingForRetry: EmailProcessingUtil.isRetryAttempt(options),
      });
      if (!started) return null;
      await processedDAO.markError(application.applicationId, messageId, EmailProcessingUtil.formatError(processingError));
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
    const stableMessageFingerprint: string | null = await EmailProcessingUtil.getStableMessageFingerprint(env, application.providerId, message.internetMessageId);
    const started: boolean = await processedDAO.tryStart(application.applicationId, application.providerId, message.id, message.conversationId || null, {
      allowExistingForRetry: EmailProcessingUtil.isRetryAttempt(options),
      providerStableMessageFingerprint: stableMessageFingerprint,
    });
    if (!started) return null;
    await EmailProcessingUtil.logProcessingStarted(contextDAO, application, message.id, options.retryAttempt);
    try {
      const body: string = OutlookProviderUtil.getMessageText(message);
      const result = await EmailProcessingUtil.generateSummaryCore(
        contextDAO, processedDAO, application, message.id,
        from, subject, body, message.conversationId || null, env, enabledApplicationIds, options,
      );
      if (!result) return null;
      return { message, ...result, emailSubject: subject, emailFrom: from, application, accessToken, messageId, options };
    } catch (error: unknown) {
      const processingError: Error = EmailProcessingUtil.classifyError(error);
      await processedDAO.markError(application.applicationId, message.id, EmailProcessingUtil.formatError(processingError));
      await EmailProcessingUtil.logProcessingError(contextDAO, application, message.id, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public static async sendOutlookSummary(data: OutlookSummaryData, env: EmailProcessingEnv): Promise<void> {
    const contextDAO = new ApplicationContextDAO(env.DB);
    const processedDAO = new ProcessedMessageDAO(env.DB);
    const existing = await processedDAO.getByMessageId(data.application.applicationId, data.messageId);
    if (existing?.status === PROCESSED_MESSAGE_STATUS_SUMMARIZED) {
      return;
    }
    try {
      await OutlookProviderUtil.sendSelfSummaryReply(data.accessToken, data.message, data.application.providerEmail!, data.summaryHtml);
      await EmailProcessingUtil.logSummarySent(contextDAO, data.application, data.messageId, data.options.retryAttempt);
      await processedDAO.markSummarized(data.application.applicationId, data.messageId);
    } catch (error: unknown) {
      const processingError: Error = EmailProcessingUtil.classifyError(error);
      await processedDAO.markError(data.application.applicationId, data.messageId, EmailProcessingUtil.formatError(processingError));
      await EmailProcessingUtil.logProcessingError(contextDAO, data.application, data.messageId, processingError, data.options.retryAttempt);
      throw processingError;
    }
  }

  private static async generateSummaryCore(
    contextDAO: ApplicationContextDAO,
    processedDAO: ProcessedMessageDAO,
    application: ConnectedApplication,
    resolvedMessageId: string,
    from: string,
    subject: string,
    body: string,
    threadId: string | null,
    env: EmailProcessingEnv,
    enabledApplicationIds: string[],
    options: EmailProcessingOptions,
  ): Promise<{ summaryHtml: string; actions: CreatedEmailAction[]; rawSummary: { gist: string; keyDetails: string[] } } | null> {
    if (application.senderDomainFilters) {
      const filterResult = SenderFilterUtil.shouldSkip(from, application.senderDomainFilters);
      if (filterResult.skip) {
        await processedDAO.markSkipped(application.applicationId, resolvedMessageId, filterResult.reason);
        return null;
      }
    }
    const matchedRule = application.emailProcessingRules?.length
      ? EmailRulesUtil.evaluate(application.emailProcessingRules, { from, subject, body })
      : null;
    if (matchedRule?.action.type === 'skip') {
      await processedDAO.markSkipped(application.applicationId, resolvedMessageId, `Matched rule: ${matchedRule.name}`);
      return null;
    }
    const suppressActions: boolean = matchedRule?.action.type === 'skip_actions';
    const customInstruction: string | undefined = matchedRule?.action.type === 'prepend_instruction' ? matchedRule.action.instruction : undefined;
    const ragContext: string | undefined = await EmailContextUtil.prepareEmailRagContext({
      env, application, enabledApplicationIds, subject, from, body,
      sourceDocumentId: resolvedMessageId, sourceThreadId: threadId,
    });
    const summary: EmailProcessingSummary = await EmailProcessingUtil.summarize(env, application, subject, from, body, ragContext, customInstruction);
    await EmailProcessingUtil.logSummaryGenerated(contextDAO, application, resolvedMessageId, options.retryAttempt);
    const processedMessage = await processedDAO.getByMessageId(application.applicationId, resolvedMessageId);
    const actions: CreatedEmailAction[] = !suppressActions && processedMessage
      ? await ActionService.createActionsForSummary(
          { application, processedMessage, subject, from, body, proposals: summary.actionProposals, callbackBaseUrl: options.callbackBaseUrl },
          env,
        )
      : [];
    if (actions.length > 0) {
      await EmailProcessingUtil.logActionsCreated(contextDAO, application, resolvedMessageId, actions, options.retryAttempt);
    }
    return { summaryHtml: EmailProcessingUtil.withActionSection(summary.html, actions), actions, rawSummary: summary.rawSummary };
  }

  private static async summarize(
    env: EmailProcessingEnv,
    application: ConnectedApplication,
    subject: string,
    from: string,
    body: string,
    ragContext?: string | undefined,
    customInstruction?: string | undefined,
  ): Promise<EmailProcessingSummary> {
    const maxChars: number = ConfigurationManager.getMaxEmailBodyChars(env);
    const bodyText: string = body || '(empty message body)';
    const input: string = EmailContentUtil.truncate(bodyText, maxChars);
    const timeZone: string | undefined = application.timeZone ?? undefined;
    const promptText: string = EmailSummaryUtil.buildEmailSummaryPromptText(subject, from, input, ragContext, timeZone, customInstruction);
    let model: string = await EmailProcessingUtil.resolveSummaryModel(env, promptText);
    let result: EmailSummaryResult;
    try {
      result = await EmailSummaryUtil.summarizeEmailWithUsage(env.AI, model, subject, from, input, ragContext, timeZone, customInstruction);
    } catch (error: unknown) {
      if (!(error instanceof AiSummaryRetryableError)) throw error;
      await EmailProcessingUtil.recordSummaryFailureUsage(env, model, error, promptText);
      const fallbackModel: string = ConfigurationManager.getEmailSummaryFallbackModel(env);
      if (model === fallbackModel) throw error;
      console.warn(`AI summary failed with primary model ${model}, retrying with fallback ${fallbackModel}:`, error);
      model = fallbackModel;
      try {
        result = await EmailSummaryUtil.summarizeEmailWithUsage(env.AI, model, subject, from, input, ragContext, timeZone, customInstruction);
      } catch (fallbackError: unknown) {
        if (fallbackError instanceof AiSummaryRetryableError) {
          await EmailProcessingUtil.recordSummaryFailureUsage(env, model, fallbackError, promptText);
        }
        throw fallbackError;
      }
    }
    const usageEstimate: AiTextGenerationUsageEstimate | undefined = await EmailProcessingUtil.recordSummaryUsage(
      env,
      model,
      result.usage,
      promptText,
      result.summary,
    );
    const rawSummary = { gist: result.emailSummary?.gist ?? '', keyDetails: result.emailSummary?.keyDetails ?? [] };
    if (!ConfigurationManager.getDebugMode(env)) return { html: result.summary, actionProposals: result.actionProposals ?? [], rawSummary };

    const applicationName: string = application.displayName || application.applicationId;
    return {
      html: [
        result.summary,
        '<hr>',
        '<pre style="font-size:11px;color:#666;white-space:pre-wrap;">',
        '--- Debug Informations ---',
        `Generated at: ${new Date().toISOString()}`,
        `Provider: ${application.providerId}`,
        `Application: ${applicationName} (${application.applicationId})`,
        `Model: ${model}`,
        `Input chars: ${input.length} / ${maxChars}${bodyText.length > input.length ? ' (truncated)' : ''}`,
        `RAG context: ${ragContext ? `used, ${ragContext.length} chars` : 'not used'}`,
        [
          `AI usage: prompt=${EmailProcessingUtil.formatDebugNumber(result.usage?.promptTokens)}`,
          `completion=${EmailProcessingUtil.formatDebugNumber(result.usage?.completionTokens)}`,
          `total=${EmailProcessingUtil.formatDebugNumber(result.usage?.totalTokens)}`,
          `estimatedNeurons=${EmailProcessingUtil.formatDebugNumber(usageEstimate?.estimatedNeurons)}`,
        ].join(' '),
        '</pre>',
      ].join('\n'),
      actionProposals: result.actionProposals ?? [],
      rawSummary,
    };
  }

  private static withActionSection(summaryHtml: string, actions: CreatedEmailAction[]): string {
    const actionSection = ActionService.renderEmailActionSection(actions);
    const parts = [summaryHtml, actionSection].filter(Boolean);
    return [...parts, '', '<p><em>Powered by Mail-Otter</em></p>'].join('\n');
  }

  private static async resolveSummaryModel(env: EmailProcessingEnv, estimatedPromptText: string): Promise<string> {
    const primaryModel: string = ConfigurationManager.getEmailSummaryModel(env);
    const fallbackThreshold: number = ConfigurationManager.getAiDailyNeuronFallbackThreshold(env);
    if (fallbackThreshold <= 0) return primaryModel;

    try {
      const usageDate: string = AiUsageUtil.getCurrentUtcUsageDate();
      const estimatedNeurons: number = await new AiDailyUsageDAO(env.DB).getEstimatedNeuronsForDate(usageDate);
      const projectedPrimaryUsage: AiTextGenerationUsageEstimate = AiUsageUtil.estimateTextGenerationUsageForTokenCounts(
        primaryModel,
        AiUsageUtil.estimateTokensFromText(estimatedPromptText),
        EMAIL_SUMMARY_MAX_COMPLETION_TOKENS,
      );
      return estimatedNeurons + projectedPrimaryUsage.estimatedNeurons >= fallbackThreshold
        ? ConfigurationManager.getEmailSummaryFallbackModel(env)
        : primaryModel;
    } catch (error: unknown) {
      console.warn('Failed to read Workers AI daily usage estimate:', error);
      return primaryModel;
    }
  }

  private static async recordSummaryUsage(
    env: EmailProcessingEnv,
    model: string,
    usage: AiTextGenerationUsage | undefined,
    fallbackInputText: string,
    fallbackOutputText: string,
  ): Promise<AiTextGenerationUsageEstimate | undefined> {
    let estimate: AiTextGenerationUsageEstimate | undefined;
    try {
      estimate = AiUsageUtil.estimateTextGenerationUsage(
        model,
        usage,
        fallbackInputText,
        fallbackOutputText,
      );
      await new AiDailyUsageDAO(env.DB).incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        promptTokens: estimate.promptTokens,
        completionTokens: estimate.completionTokens,
      });
    } catch (error: unknown) {
      console.warn('Failed to record Workers AI summary usage estimate:', error);
    }
    return estimate;
  }

  private static async recordSummaryFailureUsage(
    env: EmailProcessingEnv,
    model: string,
    error: AiSummaryRetryableError,
    fallbackInputText: string,
  ): Promise<void> {
    await EmailProcessingUtil.recordSummaryUsage(
      env,
      model,
      EmailProcessingUtil.getAiSummaryErrorUsage(error),
      fallbackInputText,
      error.aiOutputText ?? '',
    );
  }

  private static getAiSummaryErrorUsage(error: AiSummaryRetryableError): AiTextGenerationUsage | undefined {
    return error.aiUsage && typeof error.aiUsage === 'object' ? (error.aiUsage as AiTextGenerationUsage) : undefined;
  }

  private static formatDebugNumber(value: number | undefined): string {
    return value === undefined ? 'unknown' : String(value);
  }

  private static formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

  private static async getContextDocumentId(
    contextDAO: ApplicationContextDAO,
    application: ConnectedApplication,
    sourceDocumentId: string,
  ): Promise<string | undefined> {
    try {
      return await contextDAO.getContextDocumentIdBySource(application.applicationId, sourceDocumentId, SOURCE_TYPE_EMAIL);
    } catch {
      return undefined;
    }
  }

  private static async tryInsertAuditLog(
    contextDAO: ApplicationContextDAO,
    params: Omit<Parameters<ApplicationContextDAO['insertAuditLog']>[0], 'contextDocumentId' | 'applicationId' | 'userEmail'> & {
      contextDocumentId: string;
      applicationId: string;
      userEmail: string;
    },
  ): Promise<void> {
    try {
      await contextDAO.insertAuditLog(params);
    } catch {
      // audit logging is non-critical; silently ignore failures
    }
  }

  private static async logAuditEvent(
    contextDAO: ApplicationContextDAO,
    application: ConnectedApplication,
    sourceDocumentId: string,
    eventType: Parameters<ApplicationContextDAO['insertAuditLog']>[0]['eventType'],
    eventLabel: string,
    severity: Parameters<ApplicationContextDAO['insertAuditLog']>[0]['severity'],
    eventData?: unknown | undefined,
  ): Promise<void> {
    const contextDocumentId = await EmailProcessingUtil.getContextDocumentId(contextDAO, application, sourceDocumentId);
    if (!contextDocumentId) return;
    await EmailProcessingUtil.tryInsertAuditLog(contextDAO, {
      contextDocumentId,
      applicationId: application.applicationId,
      userEmail: application.userEmail,
      sourceDocumentId,
      eventType,
      eventLabel,
      eventData,
      severity,
    });
  }

  private static async logProcessingStarted(contextDAO: ApplicationContextDAO, application: ConnectedApplication, sourceDocumentId: string, retryAttempt?: number | undefined): Promise<void> {
    return EmailProcessingUtil.logAuditEvent(contextDAO, application, sourceDocumentId, CONTEXT_AUDIT_EVENT_PROCESSING_STARTED, 'Email Processing Started', CONTEXT_AUDIT_LOG_SEVERITY_INFO, retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : undefined);
  }

  private static async logSummaryGenerated(contextDAO: ApplicationContextDAO, application: ConnectedApplication, sourceDocumentId: string, retryAttempt?: number | undefined): Promise<void> {
    return EmailProcessingUtil.logAuditEvent(contextDAO, application, sourceDocumentId, CONTEXT_AUDIT_EVENT_SUMMARY_GENERATED, 'AI Summary Generated', CONTEXT_AUDIT_LOG_SEVERITY_INFO, retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : undefined);
  }

  private static async logActionsCreated(contextDAO: ApplicationContextDAO, application: ConnectedApplication, sourceDocumentId: string, actions: CreatedEmailAction[], retryAttempt?: number | undefined): Promise<void> {
    return EmailProcessingUtil.logAuditEvent(contextDAO, application, sourceDocumentId, CONTEXT_AUDIT_EVENT_ACTION_CREATED, 'Actions Created From AI Summary', CONTEXT_AUDIT_LOG_SEVERITY_INFO, { actionCount: actions.length, actionTypes: actions.map((a) => a.action.actionType), ...(retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : {}) });
  }

  private static async logSummarySent(contextDAO: ApplicationContextDAO, application: ConnectedApplication, sourceDocumentId: string, retryAttempt?: number | undefined): Promise<void> {
    return EmailProcessingUtil.logAuditEvent(contextDAO, application, sourceDocumentId, CONTEXT_AUDIT_EVENT_SUMMARY_SENT, 'Summary Email Sent', CONTEXT_AUDIT_LOG_SEVERITY_INFO, retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : undefined);
  }

  private static async logProcessingError(contextDAO: ApplicationContextDAO, application: ConnectedApplication, sourceDocumentId: string, error: Error, retryAttempt?: number | undefined): Promise<void> {
    return EmailProcessingUtil.logAuditEvent(contextDAO, application, sourceDocumentId, CONTEXT_AUDIT_EVENT_ERROR, 'Email Processing Error', error instanceof NonRetryableError ? CONTEXT_AUDIT_LOG_SEVERITY_ERROR : CONTEXT_AUDIT_LOG_SEVERITY_WARNING, { error: error.message, errorType: error.constructor?.name, ...(retryAttempt != null && retryAttempt > 1 ? { attempt: retryAttempt } : {}) });
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

interface EmailProcessingSummary {
  html: string;
  actionProposals: EmailActionProposal[];
  rawSummary: { gist: string; keyDetails: string[] };
}

interface EmailProcessingEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
  AI_SUMMARY_MODEL?: string | undefined;
  AI_SUMMARY_FALLBACK_MODEL?: string | undefined;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string | undefined;
  AI_EMBEDDING_MODEL?: string | undefined;
  MAX_EMAIL_BODY_CHARS?: string | undefined;
  DEBUG_MODE?: string | undefined;
  MAX_CONTEXT_MEMORY_CHARS?: string | undefined;
  MAX_RAG_CONTEXT_CHARS?: string | undefined;
  RAG_TOP_K?: string | undefined;
  RAG_VECTOR_QUERY_TOP_K?: string | undefined;
  ACTION_CALLBACK_BASE_URL?: string | undefined;
  ACTION_DEFAULT_EXPIRY_HOURS?: string | undefined;
}

interface EmailProcessingOptions {
  retryAttempt?: number | undefined;
  callbackBaseUrl?: string | undefined;
}

interface GmailSummaryData {
  message: GmailMessage;
  summaryHtml: string;
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
  rawSummary: { gist: string; keyDetails: string[] };
  emailSubject: string;
  emailFrom: string;
  actions: CreatedEmailAction[];
  application: ConnectedApplication;
  accessToken: string;
  messageId: string;
  options: EmailProcessingOptions;
}

export { EmailProcessingUtil };
export type { EmailProcessingEnv, EmailProcessingOptions, ResolvedApplication, GmailMessageList, GmailSummaryData, OutlookSummaryData };
