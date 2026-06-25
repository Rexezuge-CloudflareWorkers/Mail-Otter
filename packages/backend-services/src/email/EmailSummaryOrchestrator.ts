import { AiDailyUsageDAO, ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { AiSummaryRetryableError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { ConnectedApplication, EmailActionProposal } from '@mail-otter/shared/model';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import type { ProviderImageAttachment } from '@mail-otter/provider-clients';
import { ActionService } from '../action';
import type { ActionExecutionEnv, CreatedEmailAction } from '../action';
import { EmailContextUtil } from './EmailContextUtil';
import { EmailProcessingAuditLogger } from './EmailProcessingAuditLogger';
import { EmailRulesUtil } from './EmailRulesUtil';
import { ProviderOrganizationService } from './ProviderOrganizationService';
import { SenderFilterUtil } from './SenderFilterUtil';
import { EmailSummaryUtil, type AiTextGenerationUsage, type EmailSummaryResult } from './EmailSummaryUtil';
import { AiUsageUtil, type AiTextGenerationUsageEstimate } from './AiUsageUtil';
import { AttachmentAnalysisUtil } from './AttachmentAnalysisUtil';

const EMAIL_SUMMARY_MAX_COMPLETION_TOKENS = 1200;

interface EmailProcessingSummary {
  html: string;
  actionProposals: EmailActionProposal[];
  rawSummary: { gist: string; keyDetails: string[] };
  summaryModel: string;
  estimatedNeurons: number;
}

interface OrchestrationResult {
  summaryHtml: string;
  summaryModel: string;
  actions: CreatedEmailAction[];
  rawSummary: { gist: string; keyDetails: string[] };
}

interface OrchestratorEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_SIGNING_SECRET: SecretsStoreSecret;
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
  // Optional OAuth bindings — present when env is EmailProcessingEnv; needed for auto-executing
  // calendar.add_event and email.draft_reply action types.
  OAUTH2_TOKEN_CACHE?: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS?: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  ATTACHMENT_VISION_ENABLED?: string;
  ATTACHMENT_VISION_MODEL?: string;
}

class EmailSummaryOrchestrator {
  constructor(
    private readonly auditLogger: EmailProcessingAuditLogger,
    private readonly processedDAO: ProcessedMessageDAO,
    private readonly env: OrchestratorEnv,
    private readonly enabledApplicationIds: string[],
  ) {}

  async orchestrate(
    application: ConnectedApplication,
    resolvedMessageId: string,
    from: string,
    subject: string,
    body: string,
    threadId: string | null,
    options: { retryAttempt?: number; callbackBaseUrl?: string },
    hasAttachment?: boolean,
    attachmentImages?: ProviderImageAttachment[],
  ): Promise<OrchestrationResult | null> {
    if (application.senderDomainFilters) {
      const filterResult = SenderFilterUtil.shouldSkip(from, application.senderDomainFilters);
      if (filterResult.skip) {
        await this.processedDAO.markSkipped(application.applicationId, resolvedMessageId, filterResult.reason);
        return null;
      }
    }
    const rules = application.emailProcessingRules ?? [];
    const matchedRule = rules.length > 0
      ? EmailRulesUtil.evaluatePreProcessing(rules, { from, subject, body, hasAttachment })
      : null;
    if (matchedRule?.action.type === 'skip') {
      await this.processedDAO.markSkipped(application.applicationId, resolvedMessageId, `Matched rule: ${matchedRule.name}`);
      return null;
    }
    const suppressActions: boolean = matchedRule?.action.type === 'skip_actions';
    const customInstruction: string | undefined = matchedRule?.action.type === 'prepend_instruction' ? matchedRule.action.instruction : undefined;
    const ragContext: string | undefined = await EmailContextUtil.prepareEmailRagContext({
      env: this.env, application, enabledApplicationIds: this.enabledApplicationIds, subject, from, body,
      sourceDocumentId: resolvedMessageId, sourceThreadId: threadId,
    });
    const summary: EmailProcessingSummary = await this.summarize(application, resolvedMessageId, subject, from, body, ragContext, customInstruction);
    await this.auditLogger.logSummaryGenerated(application, resolvedMessageId, summary.summaryModel, summary.estimatedNeurons, options.retryAttempt);

    let attachmentSummaries: string[] = [];
    let visionProposals: EmailActionProposal[] = [];
    if (
      attachmentImages &&
      attachmentImages.length > 0 &&
      application.attachmentVisionEnabled &&
      ConfigurationManager.ai.isAttachmentVisionEnabled(this.env)
    ) {
      try {
        const visionModel = ConfigurationManager.ai.getAttachmentVisionModel(this.env);
        const visionResult = await AttachmentAnalysisUtil.analyzeAttachments(
          this.env.AI, visionModel, subject, from, attachmentImages,
        );
        attachmentSummaries = visionResult.attachmentSummaries;
        visionProposals = visionResult.actionProposals;
        const visionEstimate = await this.recordSummaryUsage(visionModel, visionResult.totalUsage, '', '');
        await this.auditLogger.logAttachmentAnalysis(
          application, resolvedMessageId, visionModel,
          attachmentImages.length, visionEstimate?.estimatedNeurons ?? 0, options.retryAttempt,
        );
      } catch (error) {
        console.warn('[EmailSummaryOrchestrator] Attachment vision analysis failed:', error);
      }
    }

    const mergedProposals: EmailActionProposal[] = [...summary.actionProposals, ...visionProposals];
    const processedMessage = await this.processedDAO.getByMessageId(application.applicationId, resolvedMessageId);
    const actions: CreatedEmailAction[] = !suppressActions && processedMessage
      ? await ActionService.createActionsForSummary(
          { application, processedMessage, subject, from, body, proposals: mergedProposals, callbackBaseUrl: options.callbackBaseUrl },
          this.env,
        )
      : [];
    if (actions.length > 0) {
      await this.auditLogger.logActionsCreated(application, resolvedMessageId, actions, options.retryAttempt);
    }
    if (application.autoExecuteActionTypes?.length && actions.length > 0) {
      await ActionService.autoExecuteCreatedActions(application.autoExecuteActionTypes, actions, this.env as ActionExecutionEnv);
    }
    if (rules.length > 0 && this.env.OAUTH2_TOKEN_CACHE && this.env.OAUTH2_TOKEN_REFRESHERS) {
      const detectedActionTypes = summary.actionProposals.map((p) => p.type);
      const matchedPostRules = EmailRulesUtil.evaluatePostProcessing(rules, {
        from, subject, body, hasAttachment, detectedActionTypes,
      });
      if (matchedPostRules.length > 0) {
        try {
          await new ProviderOrganizationService(this.env as OrchestratorEnv & { OAUTH2_TOKEN_CACHE: KVNamespace; OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace }).executePostProcessingRules(
            application, resolvedMessageId, matchedPostRules,
          );
        } catch (error: unknown) {
          console.error('[EmailSummaryOrchestrator] Post-processing rules failed:', error);
        }
      }
    }
    const summaryWithAttachments: string = attachmentSummaries.length > 0
      ? `${summary.html}\n${this.renderAttachmentSection(attachmentSummaries)}`
      : summary.html;
    return { summaryHtml: this.withActionSection(summaryWithAttachments, actions), summaryModel: summary.summaryModel, actions, rawSummary: summary.rawSummary };
  }

  private async summarize(
    application: ConnectedApplication,
    sourceDocumentId: string,
    subject: string,
    from: string,
    body: string,
    ragContext?: string,
    customInstruction?: string,
  ): Promise<EmailProcessingSummary> {
    const maxChars: number = ConfigurationManager.getMaxEmailBodyChars(this.env);
    const bodyText: string = body || '(empty message body)';
    const input: string = EmailContentUtil.truncate(bodyText, maxChars);
    const timeZone: string | undefined = application.timeZone ?? undefined;
    const promptText: string = EmailSummaryUtil.buildEmailSummaryPromptText(subject, from, input, ragContext, timeZone, customInstruction);
    let model: string = await this.resolveSummaryModel(promptText);
    let result: EmailSummaryResult;
    try {
      result = await EmailSummaryUtil.summarizeEmailWithUsage(this.env.AI, model, subject, from, input, ragContext, timeZone, customInstruction);
    } catch (error: unknown) {
      if (!(error instanceof AiSummaryRetryableError)) throw error;
      await this.recordSummaryFailureUsage(model, error, promptText);
      const fallbackModel: string = ConfigurationManager.getEmailSummaryFallbackModel(this.env);
      if (model === fallbackModel) throw error;
      console.warn(`AI summary failed with primary model ${model}, retrying with fallback ${fallbackModel}:`, error);
      await this.auditLogger.logModelFallback(application, sourceDocumentId, model, error);
      model = fallbackModel;
      try {
        result = await EmailSummaryUtil.summarizeEmailWithUsage(this.env.AI, model, subject, from, input, ragContext, timeZone, customInstruction);
      } catch (fallbackError: unknown) {
        if (fallbackError instanceof AiSummaryRetryableError) {
          await this.recordSummaryFailureUsage(model, fallbackError, promptText);
        }
        throw fallbackError;
      }
    }
    const usageEstimate: AiTextGenerationUsageEstimate | undefined = await this.recordSummaryUsage(model, result.usage, promptText, result.summary);
    const rawSummary = { gist: result.emailSummary?.gist ?? '', keyDetails: result.emailSummary?.keyDetails ?? [] };
    if (!ConfigurationManager.getDebugMode(this.env)) return { html: result.summary, actionProposals: result.actionProposals ?? [], rawSummary, summaryModel: model, estimatedNeurons: usageEstimate?.estimatedNeurons ?? 0 };

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
          `AI usage: prompt=${this.formatDebugNumber(result.usage?.promptTokens)}`,
          `completion=${this.formatDebugNumber(result.usage?.completionTokens)}`,
          `total=${this.formatDebugNumber(result.usage?.totalTokens)}`,
          `estimatedNeurons=${this.formatDebugNumber(usageEstimate?.estimatedNeurons)}`,
        ].join(' '),
        '</pre>',
      ].join('\n'),
      actionProposals: result.actionProposals ?? [],
      rawSummary,
      summaryModel: model,
      estimatedNeurons: usageEstimate?.estimatedNeurons ?? 0,
    };
  }

  private renderAttachmentSection(summaries: string[]): string {
    const items = summaries.map((s) => `<li>${EmailContentUtil.escapeHtml(s)}</li>`).join('\n');
    return `<p><strong>Attachments:</strong></p>\n<ul>\n${items}\n</ul>`;
  }

  private withActionSection(summaryHtml: string, actions: CreatedEmailAction[]): string {
    const actionSection = ActionService.renderEmailActionSection(actions);
    const parts = [summaryHtml, actionSection].filter(Boolean);
    return [...parts, '', '<p><em>Powered by Mail-Otter</em></p>'].join('\n');
  }

  private async resolveSummaryModel(estimatedPromptText: string): Promise<string> {
    const primaryModel: string = ConfigurationManager.getEmailSummaryModel(this.env);
    const fallbackThreshold: number = ConfigurationManager.getAiDailyNeuronFallbackThreshold(this.env);
    if (fallbackThreshold <= 0) return primaryModel;

    try {
      const usageDate: string = AiUsageUtil.getCurrentUtcUsageDate();
      const estimatedNeurons: number = await new AiDailyUsageDAO(this.env.DB).getEstimatedNeuronsForDate(usageDate);
      const projectedPrimaryUsage: AiTextGenerationUsageEstimate = AiUsageUtil.estimateTextGenerationUsageForTokenCounts(
        primaryModel,
        AiUsageUtil.estimateTokensFromText(estimatedPromptText),
        EMAIL_SUMMARY_MAX_COMPLETION_TOKENS,
      );
      return estimatedNeurons + projectedPrimaryUsage.estimatedNeurons >= fallbackThreshold
        ? ConfigurationManager.getEmailSummaryFallbackModel(this.env)
        : primaryModel;
    } catch (error: unknown) {
      console.warn('Failed to read Workers AI daily usage estimate:', error);
      return primaryModel;
    }
  }

  private async recordSummaryUsage(
    model: string,
    usage: AiTextGenerationUsage | undefined,
    fallbackInputText: string,
    fallbackOutputText: string,
  ): Promise<AiTextGenerationUsageEstimate | undefined> {
    let estimate: AiTextGenerationUsageEstimate | undefined;
    try {
      estimate = AiUsageUtil.estimateTextGenerationUsage(model, usage, fallbackInputText, fallbackOutputText);
      await new AiDailyUsageDAO(this.env.DB).incrementUsage({
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

  private async recordSummaryFailureUsage(model: string, error: AiSummaryRetryableError, fallbackInputText: string): Promise<void> {
    await this.recordSummaryUsage(
      model,
      error.aiUsage && typeof error.aiUsage === 'object' ? (error.aiUsage) : undefined,
      fallbackInputText,
      error.aiOutputText ?? '',
    );
  }

  private formatDebugNumber(value: number | undefined): string {
    return value === undefined ? 'unknown' : String(value);
  }
}

export type { OrchestrationResult, OrchestratorEnv };
export { EmailSummaryOrchestrator };
