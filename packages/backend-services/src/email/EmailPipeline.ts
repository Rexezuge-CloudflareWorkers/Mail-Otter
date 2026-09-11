import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError, NonRetryableError, RetryableError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import type { ProviderImageAttachment } from '@mail-otter/provider-clients';
import type { ProviderId } from '@mail-otter/shared/constants';
import type { ConnectedApplication } from '@mail-otter/shared/model';
import { CryptoUtil } from '@mail-otter/shared/utils';
import { EmailProcessingAuditLogger } from './EmailProcessingAuditLogger';
import { EmailSummaryOrchestrator } from './EmailSummaryOrchestrator';
import type { OrchestrationResult, OrchestratorEnv } from './EmailSummaryOrchestrator';
import { WorkersAiErrorUtil } from './WorkersAiErrorUtil';

interface PipelineOptions {
  retryAttempt?: number;
  callbackBaseUrl?: string;
}

// Normalized provider message passed between pipeline stages.
interface FetchedEmail<TMessage> {
  message: TMessage;
  // Resolved provider message id used for tryStart/mark* bookkeeping.
  messageId: string;
  threadId: string | null;
  from: string;
  subject: string;
  body: string;
  hasAttachment: boolean;
  // Raw stable id (Message-ID / internetMessageId) hashed for cross-provider dedup.
  fingerprintInput?: string | null;
}

// Stage 1 (fetch): retrieve + normalize a provider message.
// Returns null for silent skips (own mailbox, Mail-Otter summaries) that must not
// create a processed-message row. Throws EmailMessageNotFoundError when the message
// was deleted before processing, EmailFetchError for other fetch failures.
type FetchErrorPolicy = 'rethrow' | 'record-error';

interface PipelineFetchStage<TMessage> {
  readonly fetchErrorPolicy: FetchErrorPolicy;
  fetchMessage(): Promise<FetchedEmail<TMessage> | null>;
}

// Stage 2 (dedup): fingerprint + tryStart + logProcessingStarted.
// Implemented by EmailPipelineOrchestrator.checkDuplicate; returns true to proceed,
// false when the message was already claimed.
interface PipelineDedupInput {
  application: ConnectedApplication;
  messageId: string;
  threadId: string | null;
  fingerprintInput?: string | null;
  options: PipelineOptions;
}

interface PipelineDedupStage {
  checkDuplicate(input: PipelineDedupInput): Promise<boolean>;
}

// Stage 3 (summarize): attachment vision fetch + EmailSummaryOrchestrator.
interface PipelineSummarizeStage<TMessage, TResult> {
  fetchAttachmentImages(fetched: FetchedEmail<TMessage>): Promise<ProviderImageAttachment[]>;
  buildResult(fetched: FetchedEmail<TMessage>, result: OrchestrationResult): TResult;
}

// Stage 4 (send): post the summary reply/draft. Currently implemented by the
// EmailProcessingUtil.send*Summary methods; defined here to document the chain.
interface PipelineSendStage<TSummaryData> {
  sendSummary(data: TSummaryData): Promise<void>;
}

// Thrown by fetch stages when the provider message no longer exists.
class EmailMessageNotFoundError extends Error {
  public readonly messageId: string;
  public readonly skipReason: string;

  constructor(messageId: string, skipReason: string) {
    super(skipReason);
    this.name = 'EmailMessageNotFoundError';
    this.messageId = messageId;
    this.skipReason = skipReason;
  }
}

// Wraps non-not-found fetch failures so the orchestrator can record them
// (tryStart + markError) for providers with 'record-error' policy.
class EmailFetchError extends Error {
  public readonly messageId: string;
  public readonly fetchCause: unknown;

  constructor(messageId: string, fetchCause: unknown) {
    super(fetchCause instanceof Error ? fetchCause.message : String(fetchCause));
    this.name = 'EmailFetchError';
    this.messageId = messageId;
    this.fetchCause = fetchCause;
  }
}

// Orchestrates the fetch -> dedup -> summarize chain, encapsulating the shared
// skeleton: tryStart, logProcessingStarted, classifyError, markError, logProcessingError.
class EmailPipelineOrchestrator implements PipelineDedupStage {
  constructor(
    private readonly processedDAO: ProcessedMessageDAO,
    private readonly auditLogger: EmailProcessingAuditLogger,
    private readonly env: OrchestratorEnv,
    private readonly enabledApplicationIds: string[],
  ) {}

  public async runGenerate<TMessage, TResult>(
    application: ConnectedApplication,
    options: PipelineOptions,
    fetchStage: PipelineFetchStage<TMessage>,
    summarizeStage: PipelineSummarizeStage<TMessage, TResult>,
  ): Promise<TResult | null> {
    let fetched: FetchedEmail<TMessage> | null;
    try {
      fetched = await fetchStage.fetchMessage();
    } catch (error: unknown) {
      if (error instanceof EmailMessageNotFoundError) {
        const started: boolean = await this.processedDAO.tryStart(
          application.applicationId,
          application.providerId,
          error.messageId,
          null,
          { allowExistingForRetry: isPipelineRetryAttempt(options) },
        );
        if (!started) return null;
        await this.processedDAO.markSkipped(application.applicationId, error.messageId, error.skipReason);
        return null;
      }
      if (error instanceof EmailFetchError && fetchStage.fetchErrorPolicy === 'record-error') {
        const processingError: Error = classifyPipelineError(error.fetchCause);
        const started: boolean = await this.processedDAO.tryStart(
          application.applicationId,
          application.providerId,
          error.messageId,
          null,
          { allowExistingForRetry: isPipelineRetryAttempt(options) },
        );
        if (!started) return null;
        await this.processedDAO.markError(application.applicationId, error.messageId, processingError.message);
        throw processingError;
      }
      throw error instanceof EmailFetchError ? error.fetchCause : error;
    }
    const resolved: FetchedEmail<TMessage> | null = fetched;
    if (!resolved) return null;

    const proceed: boolean = await this.checkDuplicate({
      application,
      messageId: resolved.messageId,
      threadId: resolved.threadId,
      fingerprintInput: resolved.fingerprintInput,
      options,
    });
    if (!proceed) return null;

    try {
      const attachmentImages: ProviderImageAttachment[] = await getAttachmentImagesSafe(
        () => summarizeStage.fetchAttachmentImages(resolved),
        application.providerId,
        resolved.hasAttachment,
        this.env,
      );
      const orchestrator = new EmailSummaryOrchestrator(this.auditLogger, this.processedDAO, this.env, this.enabledApplicationIds);
      const result: OrchestrationResult | null = await orchestrator.orchestrate(
        application,
        resolved.messageId,
        resolved.from,
        resolved.subject,
        resolved.body,
        resolved.threadId,
        options,
        resolved.hasAttachment,
        attachmentImages,
      );
      if (!result) return null;
      return summarizeStage.buildResult(resolved, result);
    } catch (error: unknown) {
      const processingError: Error = classifyPipelineError(error);
      await this.processedDAO.markError(application.applicationId, resolved.messageId, processingError.message);
      await this.auditLogger.logProcessingError(application, resolved.messageId, processingError, options.retryAttempt);
      throw processingError;
    }
  }

  public async checkDuplicate(input: PipelineDedupInput): Promise<boolean> {
    const fingerprint: string | null = await getStableMessageFingerprint(this.env, input.application.providerId, input.fingerprintInput);
    const started: boolean = await this.processedDAO.tryStart(
      input.application.applicationId,
      input.application.providerId,
      input.messageId,
      input.threadId,
      {
        allowExistingForRetry: isPipelineRetryAttempt(input.options),
        providerStableMessageFingerprint: fingerprint,
      },
    );
    if (!started) return false;
    await this.auditLogger.logProcessingStarted(input.application, input.messageId, input.options.retryAttempt);
    return true;
  }
}

function isPipelineRetryAttempt(options: PipelineOptions): boolean {
  return typeof options.retryAttempt === 'number' && options.retryAttempt > 1;
}

async function getStableMessageFingerprint(
  env: Pick<OrchestratorEnv, 'AES_ENCRYPTION_KEY_SECRET'>,
  providerId: ProviderId,
  stableMessageId: string | null | undefined,
): Promise<string | null> {
  const normalizedStableMessageId: string = stableMessageId?.trim() || '';
  if (!normalizedStableMessageId) return null;
  const secret: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
  return CryptoUtil.hmacSha256Hex(`provider-stable-message-id\n${providerId}\n${normalizedStableMessageId}`, secret);
}

function classifyPipelineError(error: unknown): Error {
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

// Shared attachment-vision guard: skip when disabled/absent, degrade to no images on fetch failure.
async function getAttachmentImagesSafe(
  fetcher: () => Promise<ProviderImageAttachment[]>,
  providerLabel: string,
  hasAttachment: boolean,
  env: Pick<OrchestratorEnv, 'ATTACHMENT_VISION_ENABLED'>,
): Promise<ProviderImageAttachment[]> {
  if (!hasAttachment || !ConfigurationManager.ai.isAttachmentVisionEnabled(env)) return [];
  try {
    return await fetcher();
  } catch (error: unknown) {
    console.warn(`[EmailPipeline] ${providerLabel} attachment fetch failed:`, error);
    return [];
  }
}

export {
  EmailFetchError,
  EmailMessageNotFoundError,
  EmailPipelineOrchestrator,
  classifyPipelineError,
  getAttachmentImagesSafe,
  getStableMessageFingerprint,
  isPipelineRetryAttempt,
};
export type {
  FetchErrorPolicy,
  FetchedEmail,
  PipelineDedupInput,
  PipelineDedupStage,
  PipelineFetchStage,
  PipelineOptions,
  PipelineSendStage,
  PipelineSummarizeStage,
};
