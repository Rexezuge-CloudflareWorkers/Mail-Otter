import { AiDailyUsageDAO, ApplicationContextDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { NonRetryableError } from '@mail-otter/backend-errors';
import { EmailContentUtil } from '@mail-otter/provider-clients/email-content';
import type { ApplicationContextDocument, ConnectedApplication } from '@mail-otter/shared/model';
import { CONTEXT_AUDIT_EVENT_CONTEXT_INDEXED, CONTEXT_AUDIT_EVENT_EMBEDDING_GENERATED, CONTEXT_AUDIT_EVENT_RAG_QUERIED, CONTEXT_AUDIT_EVENT_ERROR, CONTEXT_AUDIT_LOG_SEVERITY_INFO, CONTEXT_AUDIT_LOG_SEVERITY_WARNING } from '@mail-otter/shared/constants';
import { CryptoUtil } from '@mail-otter/shared/utils';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AiUsageUtil, type AiEmbeddingUsageEstimate } from './AiUsageUtil';
import { WorkersAiErrorUtil } from './WorkersAiErrorUtil';

class EmailContextUtil {
  public static async getUserVectorNamespace(userEmail: string): Promise<string> {
    const normalized: string = userEmail.trim().toLowerCase();
    const hash: string = await CryptoUtil.sha256Hex(normalized);
    return `u_${hash.slice(0, 62)}`;
  }

  public static async prepareEmailRagContext(input: PrepareEmailRagContextInput): Promise<string | undefined> {
    if (!input.env.EMAIL_CONTEXT_INDEX) return undefined;
    const enabledApplicationIds: Set<string> = new Set(input.enabledApplicationIds);
    const shouldRetrieve: boolean = input.application.ragRetrievalEnabled !== false && enabledApplicationIds.size > 0;
    const shouldStore: boolean = input.application.contextIndexingEnabled;
    if (!shouldRetrieve && !shouldStore) return undefined;
    if (await EmailContextUtil.shouldSkipWorkersAiForDailyUsage(input.env)) return undefined;

    const contextDAO = new ApplicationContextDAO(input.env.DB);
    const vectorNamespace: string = await EmailContextUtil.getUserVectorNamespace(input.application.userEmail);
    const indexedText: string = EmailContextUtil.buildIndexedText(input);
    let document: ApplicationContextDocument | undefined;
    let auditMetadata: EmailDocumentAuditMetadata | undefined;
    if (shouldStore) {
      auditMetadata = await EmailContextUtil.buildAuditMetadata(input, indexedText);
      document = await contextDAO.upsertEmailDocument({
        applicationId: input.application.applicationId,
        userEmail: input.application.userEmail,
        sourceProviderId: input.application.providerId,
        sourceDocumentId: input.sourceDocumentId,
        sourceThreadId: input.sourceThreadId,
        vectorNamespace,
        ...auditMetadata,
      });
    }

    try {
      const embeddingModel: string = ConfigurationManager.getAiEmbeddingModel(input.env);
      const embedding: number[] = await EmailContextUtil.embed(input.env.AI, embeddingModel, indexedText);
      await EmailContextUtil.recordEmbeddingUsage(input.env, embeddingModel, indexedText);
      if (shouldStore && document) {
        await contextDAO.insertAuditLog({
          contextDocumentId: document.contextDocumentId,
          applicationId: input.application.applicationId,
          userEmail: input.application.userEmail,
          sourceDocumentId: input.sourceDocumentId,
          eventType: CONTEXT_AUDIT_EVENT_EMBEDDING_GENERATED,
          eventLabel: 'AI Embedding Generated',
          eventData: { embeddingModel },
          severity: CONTEXT_AUDIT_LOG_SEVERITY_INFO,
        });
      }
      const ragContext: string | undefined = shouldRetrieve
        ? await EmailContextUtil.queryRelevantContext(input.env, embedding, vectorNamespace, enabledApplicationIds, document?.vectorId)
        : undefined;
      if (document && ragContext) {
        await contextDAO.insertAuditLog({
          contextDocumentId: document.contextDocumentId,
          applicationId: input.application.applicationId,
          userEmail: input.application.userEmail,
          sourceDocumentId: input.sourceDocumentId,
          eventType: CONTEXT_AUDIT_EVENT_RAG_QUERIED,
          eventLabel: 'Relevant Context Retrieved',
          eventData: { ragChars: ragContext.length },
          severity: CONTEXT_AUDIT_LOG_SEVERITY_INFO,
        });
      }
      if (shouldStore && document && auditMetadata) {
        await input.env.EMAIL_CONTEXT_INDEX.upsert([
          {
            id: document.vectorId,
            namespace: vectorNamespace,
            values: embedding,
            metadata: {
              applicationId: input.application.applicationId,
              sourceType: 'email',
              sourceProviderId: input.application.providerId,
              sourceDocumentId: input.sourceDocumentId,
              sourceThreadId: input.sourceThreadId || '',
              title: EmailContextUtil.truncateMetadata(input.subject),
              sender: EmailContextUtil.truncateMetadata(input.from),
              indexedText,
              indexedAt: Date.now(),
            },
          },
        ]);
        await contextDAO.markDocumentIndexed(document.contextDocumentId);
        await contextDAO.insertAuditLog({
          contextDocumentId: document.contextDocumentId,
          applicationId: input.application.applicationId,
          userEmail: input.application.userEmail,
          sourceDocumentId: input.sourceDocumentId,
          eventType: CONTEXT_AUDIT_EVENT_CONTEXT_INDEXED,
          eventLabel: 'Email Document Indexed Into Context',
          eventData: {
            indexedTextChars: auditMetadata.indexedTextChars,
            sourceProviderId: input.application.providerId,
            vectorId: document.vectorId,
          },
          severity: CONTEXT_AUDIT_LOG_SEVERITY_INFO,
        });
      }
      return ragContext;
    } catch (error: unknown) {
      console.warn('Email context indexing or retrieval failed:', error);
      if (document) {
        await contextDAO.markDocumentError(document.contextDocumentId, error instanceof Error ? error.message : String(error));
        await contextDAO.insertAuditLog({
          contextDocumentId: document.contextDocumentId,
          applicationId: input.application.applicationId,
          userEmail: input.application.userEmail,
          sourceDocumentId: input.sourceDocumentId,
          eventType: CONTEXT_AUDIT_EVENT_ERROR,
          eventLabel: 'Context Indexing Or Retrieval Failed',
          eventData: { error: error instanceof Error ? error.message : String(error) },
          severity: CONTEXT_AUDIT_LOG_SEVERITY_WARNING,
        });
      }
      if (WorkersAiErrorUtil.isDailyFreeAllocationError(error)) {
        throw new NonRetryableError(WorkersAiErrorUtil.getDailyFreeAllocationMessage());
      }
      return undefined;
    }
  }

  public static chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private static buildIndexedText(input: PrepareEmailRagContextInput): string {
    const maxChars: number = ConfigurationManager.getMaxContextMemoryChars(input.env);
    const text: string = [
      `Subject: ${input.subject || '(no subject)'}`,
      `From: ${input.from || '(unknown)'}`,
      `Application: ${input.application.displayName}`,
      '',
      input.body || '(empty message body)',
    ].join('\n');
    return EmailContentUtil.truncate(text, maxChars);
  }

  private static async buildAuditMetadata(input: PrepareEmailRagContextInput, indexedText: string): Promise<EmailDocumentAuditMetadata> {
    const secret: string = await input.env.AES_ENCRYPTION_KEY_SECRET.get();
    return {
      sourceDocumentFingerprint: await EmailContextUtil.fingerprint(secret, 'source-document', input.sourceDocumentId),
      sourceThreadFingerprint: input.sourceThreadId
        ? await EmailContextUtil.fingerprint(secret, 'source-thread', input.sourceThreadId)
        : null,
      titleFingerprint: input.subject ? await EmailContextUtil.fingerprint(secret, 'title', input.subject) : null,
      senderFingerprint: input.from ? await EmailContextUtil.fingerprint(secret, 'sender', input.from) : null,
      contentFingerprint: await EmailContextUtil.fingerprint(secret, 'indexed-text', indexedText),
      indexedTextChars: indexedText.length,
    };
  }

  private static async fingerprint(secret: string, label: string, value: string): Promise<string> {
    return CryptoUtil.hmacSha256Hex(`${label}\n${value}`, secret);
  }

  private static async embed(ai: Ai, model: string, text: string): Promise<number[]> {
    const result = (await ai.run(model, { text: [text] })) as WorkersAiEmbeddingResult;
    const embedding: unknown = Array.isArray(result.data?.[0]) ? result.data[0] : result.data;
    if (!Array.isArray(embedding) || !embedding.every((item: unknown): item is number => typeof item === 'number')) {
      throw new Error('Workers AI did not return an embedding vector.');
    }
    return embedding;
  }

  private static async recordEmbeddingUsage(env: EmailContextEnv, model: string, text: string): Promise<void> {
    try {
      const estimate: AiEmbeddingUsageEstimate = AiUsageUtil.estimateEmbeddingUsage(model, text);
      await new AiDailyUsageDAO(env.DB).incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        embeddingTokens: estimate.embeddingTokens,
      });
    } catch (error: unknown) {
      console.warn('Failed to record Workers AI embedding usage estimate:', error);
    }
  }

  private static async shouldSkipWorkersAiForDailyUsage(env: EmailContextEnv): Promise<boolean> {
    const fallbackThreshold: number = ConfigurationManager.getAiDailyNeuronFallbackThreshold(env);
    if (fallbackThreshold <= 0) return false;
    try {
      const estimatedNeurons: number = await new AiDailyUsageDAO(env.DB).getEstimatedNeuronsForDate(AiUsageUtil.getCurrentUtcUsageDate());
      return estimatedNeurons >= fallbackThreshold;
    } catch (error: unknown) {
      console.warn('Failed to read Workers AI daily usage estimate for context:', error);
      return false;
    }
  }

  private static async queryRelevantContext(
    env: EmailContextEnv,
    embedding: number[],
    vectorNamespace: string,
    enabledApplicationIds: Set<string>,
    excludedVectorId: string | undefined,
  ): Promise<string | undefined> {
    if (!env.EMAIL_CONTEXT_INDEX) return undefined;
    const queryTopK: number = ConfigurationManager.getRagVectorQueryTopK(env);
    const ragTopK: number = ConfigurationManager.getRagTopK(env);
    const maxContextChars: number = ConfigurationManager.getMaxRagContextChars(env);
    const matches: VectorizeMatches = await env.EMAIL_CONTEXT_INDEX.query(embedding, {
      namespace: vectorNamespace,
      topK: queryTopK,
      returnMetadata: 'all',
    });
    const snippets: string[] = matches.matches
      .filter((match: VectorizeMatch): boolean => match.id !== excludedVectorId)
      .filter((match: VectorizeMatch): boolean => {
        const applicationId = EmailContextUtil.getStringMetadata(match.metadata, 'applicationId');
        return Boolean(applicationId && enabledApplicationIds.has(applicationId));
      })
      .slice(0, ragTopK)
      .map((match: VectorizeMatch, index: number): string => EmailContextUtil.renderMatch(index + 1, match))
      .filter(Boolean);
    if (snippets.length === 0) return undefined;
    return EmailContentUtil.truncate(['Prior relevant documents:', ...snippets].join('\n\n'), maxContextChars);
  }

  private static renderMatch(index: number, match: VectorizeMatch): string {
    const title: string = EmailContextUtil.getStringMetadata(match.metadata, 'title') || '(untitled)';
    const sender: string = EmailContextUtil.getStringMetadata(match.metadata, 'sender') || '(unknown sender)';
    const indexedText: string = EmailContextUtil.getStringMetadata(match.metadata, 'indexedText') || '';
    return [`${index}. ${title}`, `From: ${sender}`, indexedText].filter(Boolean).join('\n');
  }

  private static getStringMetadata(metadata: Record<string, VectorizeVectorMetadata> | undefined, key: string): string | undefined {
    const value: VectorizeVectorMetadata | undefined = metadata?.[key];
    return typeof value === 'string' ? value : undefined;
  }

  private static truncateMetadata(value: string): string {
    return value.length <= 512 ? value : value.slice(0, 512);
  }
}

interface PrepareEmailRagContextInput {
  env: EmailContextEnv;
  application: ConnectedApplication;
  enabledApplicationIds: string[];
  subject: string;
  from: string;
  body: string;
  sourceDocumentId: string;
  sourceThreadId?: string | null | undefined;
}

interface EmailContextEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string | undefined;
  AI_EMBEDDING_MODEL?: string | undefined;
  RAG_TOP_K?: string | undefined;
  RAG_VECTOR_QUERY_TOP_K?: string | undefined;
  MAX_CONTEXT_MEMORY_CHARS?: string | undefined;
  MAX_RAG_CONTEXT_CHARS?: string | undefined;
}

interface WorkersAiEmbeddingResult {
  data?: number[] | number[][] | undefined;
}

interface EmailDocumentAuditMetadata {
  sourceDocumentFingerprint: string;
  sourceThreadFingerprint?: string | null | undefined;
  titleFingerprint?: string | null | undefined;
  senderFingerprint?: string | null | undefined;
  contentFingerprint: string;
  indexedTextChars: number;
}

export { EmailContextUtil };
export type { EmailContextEnv, EmailDocumentAuditMetadata, PrepareEmailRagContextInput, WorkersAiEmbeddingResult };
