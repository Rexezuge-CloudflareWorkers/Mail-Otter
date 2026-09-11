import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockMarkSkipped,
  mockGetByMessageId,
  mockGetEstimatedNeuronsForDate,
  mockLogSummaryGenerated,
  mockLogActionsCreated,
  mockLogAttachmentAnalysis,
  mockLogModelFallback,
  mockPrepareEmailRagContext,
  mockShouldSkip,
  mockEvaluatePreProcessing,
  mockEvaluatePostProcessing,
  mockBuildPrompt,
  mockSummarizeWithUsage,
  mockAnalyzeAttachments,
  mockCreateActionsForSummary,
  mockAutoExecuteCreatedActions,
  mockRenderEmailActionSection,
  mockRecordTextGenerationUsage,
  mockExecutePostProcessingRules,
} = vi.hoisted(() => ({
  mockMarkSkipped: vi.fn().mockResolvedValue(undefined),
  mockGetByMessageId: vi.fn(),
  mockGetEstimatedNeuronsForDate: vi.fn().mockResolvedValue(0),
  mockLogSummaryGenerated: vi.fn().mockResolvedValue(undefined),
  mockLogActionsCreated: vi.fn().mockResolvedValue(undefined),
  mockLogAttachmentAnalysis: vi.fn().mockResolvedValue(undefined),
  mockLogModelFallback: vi.fn().mockResolvedValue(undefined),
  mockPrepareEmailRagContext: vi.fn().mockResolvedValue(undefined),
  mockShouldSkip: vi.fn().mockReturnValue({ skip: false }),
  mockEvaluatePreProcessing: vi.fn().mockReturnValue(null),
  mockEvaluatePostProcessing: vi.fn().mockReturnValue([]),
  mockBuildPrompt: vi.fn().mockReturnValue('prompt'),
  mockSummarizeWithUsage: vi.fn(),
  mockAnalyzeAttachments: vi.fn(),
  mockCreateActionsForSummary: vi.fn().mockResolvedValue([]),
  mockAutoExecuteCreatedActions: vi.fn().mockResolvedValue(undefined),
  mockRenderEmailActionSection: vi.fn().mockReturnValue(''),
  mockRecordTextGenerationUsage: vi.fn().mockResolvedValue({ estimatedNeurons: 9, promptTokens: 5, completionTokens: 5 }),
  mockExecutePostProcessingRules: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  AiDailyUsageDAO: vi.fn(function () {
    return { getEstimatedNeuronsForDate: mockGetEstimatedNeuronsForDate };
  }),
  ProcessedMessageDAO: vi.fn(function () {
    return { markSkipped: mockMarkSkipped, getByMessageId: mockGetByMessageId };
  }),
}));

vi.mock('@mail-otter/backend-runtime/config', () => ({
  ConfigurationManager: {
    getMaxEmailBodyChars: vi.fn(() => 10_000),
    getEmailSummaryModel: vi.fn(() => 'primary-model'),
    getEmailSummaryFallbackModel: vi.fn(() => 'fallback-model'),
    getAiDailyNeuronFallbackThreshold: vi.fn(() => 0),
    getDebugMode: vi.fn(() => false),
    ai: {
      isAttachmentVisionEnabled: vi.fn(() => false),
      getAttachmentVisionModel: vi.fn(() => 'vision-model'),
    },
  },
}));

vi.mock('@mail-otter/provider-clients/email-content', () => ({
  EmailContentUtil: {
    truncate: vi.fn((value: string) => value),
    escapeHtml: vi.fn((value: string) => value),
  },
}));

vi.mock('../../packages/backend-services/src/action', () => ({
  ActionService: {
    createActionsForSummary: mockCreateActionsForSummary,
    autoExecuteCreatedActions: mockAutoExecuteCreatedActions,
    renderEmailActionSection: mockRenderEmailActionSection,
  },
}));

vi.mock('../../packages/backend-services/src/ai/AiClient', () => ({
  AiClient: { recordTextGenerationUsage: mockRecordTextGenerationUsage },
}));

vi.mock('../../packages/backend-services/src/email/EmailContextUtil', () => ({
  EmailContextUtil: { prepareEmailRagContext: mockPrepareEmailRagContext },
}));

vi.mock('../../packages/backend-services/src/email/EmailProcessingAuditLogger', () => ({
  EmailProcessingAuditLogger: vi.fn(function () {
    return {
      logSummaryGenerated: mockLogSummaryGenerated,
      logActionsCreated: mockLogActionsCreated,
      logAttachmentAnalysis: mockLogAttachmentAnalysis,
      logModelFallback: mockLogModelFallback,
    };
  }),
}));

vi.mock('../../packages/backend-services/src/email/EmailRulesUtil', () => ({
  EmailRulesUtil: {
    evaluatePreProcessing: mockEvaluatePreProcessing,
    evaluatePostProcessing: mockEvaluatePostProcessing,
  },
}));

vi.mock('../../packages/backend-services/src/email/SenderFilterUtil', () => ({
  SenderFilterUtil: { shouldSkip: mockShouldSkip },
}));

vi.mock('../../packages/backend-services/src/email/EmailSummaryUtil', () => ({
  EmailSummaryUtil: {
    buildEmailSummaryPromptText: mockBuildPrompt,
    summarizeEmailWithUsage: mockSummarizeWithUsage,
  },
}));

vi.mock('../../packages/backend-services/src/email/AttachmentAnalysisUtil', () => ({
  AttachmentAnalysisUtil: { analyzeAttachments: mockAnalyzeAttachments },
}));

vi.mock('../../packages/backend-services/src/email/ProviderOrganizationService', () => ({
  ProviderOrganizationService: vi.fn(function () {
    return { executePostProcessingRules: mockExecutePostProcessingRules };
  }),
}));

import { EmailSummaryOrchestrator } from '../../packages/backend-services/src/email/EmailSummaryOrchestrator';
import { EmailProcessingAuditLogger } from '../../packages/backend-services/src/email/EmailProcessingAuditLogger';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { AiSummaryRetryableError } from '@mail-otter/backend-errors';
import type { ConnectedApplication } from '@mail-otter/shared/model';

function makeApp(overrides: Record<string, unknown> = {}): ConnectedApplication {
  return {
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    displayName: 'Test Mailbox',
    ...overrides,
  } as ConnectedApplication;
}

function makeEnv(extra: Record<string, unknown> = {}) {
  return {
    DB: {} as never,
    AES_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('master') },
    AI: { run: vi.fn() } as unknown as Ai,
    ACTION_ENCRYPTION_KEY_SECRET: { get: vi.fn().mockResolvedValue('action-key') },
    ACTION_SIGNING_SECRET: { get: vi.fn().mockResolvedValue('sign-key') },
    ...extra,
  } as never;
}

function makeOrchestrator(envExtra: Record<string, unknown> = {}) {
  const env = makeEnv(envExtra);
  const auditLogger = new EmailProcessingAuditLogger({} as never);
  const processedDAO = new ProcessedMessageDAO({} as never);
  return new EmailSummaryOrchestrator(auditLogger, processedDAO, env, ['app-1']);
}

const SUMMARY_RESULT = {
  summary: '<p>Summary html</p>',
  actionProposals: [{ type: 'calendar.add_event' }],
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  emailSummary: { gist: 'gist text', keyDetails: ['detail one'] },
};

describe('EmailSummaryOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShouldSkip.mockReturnValue({ skip: false });
    mockEvaluatePreProcessing.mockReturnValue(null);
    mockEvaluatePostProcessing.mockReturnValue([]);
    mockPrepareEmailRagContext.mockResolvedValue(undefined);
    mockSummarizeWithUsage.mockResolvedValue(SUMMARY_RESULT);
    mockGetByMessageId.mockResolvedValue({ processedMessageId: 'pm-1' });
    mockCreateActionsForSummary.mockResolvedValue([]);
    mockRenderEmailActionSection.mockReturnValue('');
  });

  it('skips senders rejected by domain filters', async () => {
    mockShouldSkip.mockReturnValue({ skip: true, reason: 'blocked sender' });
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.orchestrate(
      makeApp({ senderDomainFilters: { includeRules: ['@allowed.com'] } }),
      'msg-1',
      'spam@evil.com',
      'Subject',
      'Body',
      null,
      {},
    );
    expect(result).toBeNull();
    expect(mockMarkSkipped).toHaveBeenCalledWith('app-1', 'msg-1', 'blocked sender');
    expect(mockSummarizeWithUsage).not.toHaveBeenCalled();
  });

  it('skips messages matching a skip rule', async () => {
    mockEvaluatePreProcessing.mockReturnValue({ name: 'Skip newsletters', action: { type: 'skip' } });
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.orchestrate(
      makeApp({ emailProcessingRules: [{ name: 'Skip newsletters' }] }),
      'msg-1',
      'news@example.com',
      'Newsletter',
      'Body',
      null,
      {},
    );
    expect(result).toBeNull();
    expect(mockMarkSkipped).toHaveBeenCalledWith('app-1', 'msg-1', 'Matched rule: Skip newsletters');
  });

  it('summarizes and creates actions on the happy path', async () => {
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.orchestrate(makeApp(), 'msg-1', 'a@b.c', 'Subject', 'Body text', 't-1', {
      retryAttempt: 1,
    });
    expect(mockSummarizeWithUsage).toHaveBeenCalledOnce();
    expect(mockLogSummaryGenerated).toHaveBeenCalledWith(makeApp(), 'msg-1', 'primary-model', 9, 1);
    expect(mockCreateActionsForSummary).toHaveBeenCalled();
    expect(result?.summaryModel).toBe('primary-model');
    expect(result?.summaryHtml).toContain('<p>Summary html</p>');
    expect(result?.rawSummary).toEqual({ gist: 'gist text', keyDetails: ['detail one'] });
  });

  it('suppresses action creation for skip_actions rules', async () => {
    mockEvaluatePreProcessing.mockReturnValue({ name: 'No actions', action: { type: 'skip_actions' } });
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.orchestrate(
      makeApp({ emailProcessingRules: [{ name: 'No actions' }] }),
      'msg-1',
      'a@b.c',
      'Subject',
      'Body',
      null,
      {},
    );
    expect(mockCreateActionsForSummary).not.toHaveBeenCalled();
    expect(result?.actions).toEqual([]);
  });

  it('retries with the fallback model after a retryable failure', async () => {
    mockSummarizeWithUsage
      .mockRejectedValueOnce(new AiSummaryRetryableError('primary down', { aiOutputText: 'partial' }))
      .mockResolvedValueOnce({ ...SUMMARY_RESULT, summary: '<p>fallback html</p>' });
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.orchestrate(makeApp(), 'msg-1', 'a@b.c', 'Subject', 'Body', null, {});
    expect(mockLogModelFallback).toHaveBeenCalled();
    expect(result?.summaryModel).toBe('fallback-model');
    expect(result?.summaryHtml).toContain('<p>fallback html</p>');
  });

  it('analyzes attachments when vision is enabled', async () => {
    const { ConfigurationManager } = await import('@mail-otter/backend-runtime/config');
    vi.mocked(ConfigurationManager.ai.isAttachmentVisionEnabled).mockReturnValueOnce(true);
    mockAnalyzeAttachments.mockResolvedValue({
      attachmentSummaries: ['image shows a cat'],
      actionProposals: [{ type: 'email.draft_reply' }],
      totalUsage: { promptTokens: 3, completionTokens: 2 },
    });
    const orchestrator = makeOrchestrator();
    const result = await orchestrator.orchestrate(
      makeApp({ attachmentVisionEnabled: true }),
      'msg-1',
      'a@b.c',
      'Subject',
      'Body',
      null,
      {},
      true,
      [{ filename: 'cat.png', mimeType: 'image/png', base64Data: 'x', sizeBytes: 10 }],
    );
    expect(mockAnalyzeAttachments).toHaveBeenCalled();
    expect(mockLogAttachmentAnalysis).toHaveBeenCalled();
    expect(result?.summaryHtml).toContain('image shows a cat');
  });

  it('executes post-processing rules when OAuth bindings exist', async () => {
    const postRule = { name: 'Archive receipts', action: { type: 'archive' } };
    mockEvaluatePostProcessing.mockReturnValue([postRule]);
    const orchestrator = makeOrchestrator({
      OAUTH2_TOKEN_CACHE: {},
      OAUTH2_TOKEN_REFRESHERS: {},
    });
    await orchestrator.orchestrate(
      makeApp({ emailProcessingRules: [{ name: 'Archive receipts' }] }),
      'msg-1',
      'a@b.c',
      'Subject',
      'Body',
      null,
      {},
    );
    expect(mockExecutePostProcessingRules).toHaveBeenCalled();
  });
});
