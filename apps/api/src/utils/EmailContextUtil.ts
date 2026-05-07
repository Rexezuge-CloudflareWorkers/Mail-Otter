import {
  DEFAULT_AI_EMBEDDING_MODEL,
  DEFAULT_MAX_CONTEXT_MEMORY_CHARS,
  DEFAULT_MAX_RAG_CONTEXT_CHARS,
  DEFAULT_RAG_TOP_K,
  DEFAULT_RAG_VECTOR_QUERY_TOP_K,
} from '@mail-otter/shared/constants';
import { ApplicationContextDAO } from '@/dao';
import type { ApplicationContextDocument, ConnectedApplication } from '@mail-otter/shared/model';
import { ConfigurationUtil, CryptoUtil } from '@mail-otter/shared/utils';
import { EmailContentUtil } from './EmailContentUtil';

class EmailContextUtil {
  public static async getUserVectorNamespace(userEmail: string): Promise<string> {
    const normalized: string = userEmail.trim().toLowerCase();
    const hash: string = await CryptoUtil.sha256Hex(normalized);
    return `u_${hash.slice(0, 62)}`;
  }

  public static async prepareEmailRagContext(input: PrepareEmailRagContextInput): Promise<string | undefined> {
    if (!input.env.EMAIL_CONTEXT_INDEX) return undefined;
    const enabledApplicationIds: Set<string> = new Set(input.enabledApplicationIds);
    const shouldRetrieve: boolean = enabledApplicationIds.size > 0;
    const shouldStore: boolean = input.application.contextIndexingEnabled;
    if (!shouldRetrieve && !shouldStore) return undefined;

    const contextDAO = new ApplicationContextDAO(input.env.DB);
    const vectorNamespace: string = await EmailContextUtil.getUserVectorNamespace(input.application.userEmail);
    const indexedText: string = EmailContextUtil.buildIndexedText(input);
    let document: ApplicationContextDocument | undefined;
    if (shouldStore) {
      const auditMetadata: EmailDocumentAuditMetadata = await EmailContextUtil.buildAuditMetadata(input, indexedText);
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
      const embedding: number[] = await EmailContextUtil.embed(input.env.AI, input.env.AI_EMBEDDING_MODEL || DEFAULT_AI_EMBEDDING_MODEL, indexedText);
      const ragContext: string | undefined = shouldRetrieve
        ? await EmailContextUtil.queryRelevantContext(input.env, embedding, vectorNamespace, enabledApplicationIds, document?.vectorId)
        : undefined;
      if (shouldStore && document) {
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
      }
      return ragContext;
    } catch (error: unknown) {
      console.warn('Email context indexing or retrieval failed:', error);
      if (document) {
        await contextDAO.markDocumentError(document.contextDocumentId, error instanceof Error ? error.message : String(error));
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
    const maxChars: number = ConfigurationUtil.getPositiveInteger(input.env.MAX_CONTEXT_MEMORY_CHARS, DEFAULT_MAX_CONTEXT_MEMORY_CHARS);
    const text: string = [
      `Subject: ${input.subject || '(no subject)'}`,
      `From: ${input.from || '(unknown)'}`,
      `Application: ${input.application.displayName}`,
      '',
      input.body || '(empty message body)',
    ].join('\n');
    return EmailContentUtil.truncate(text, maxChars);
  }

  private static async buildAuditMetadata(
    input: PrepareEmailRagContextInput,
    indexedText: string,
  ): Promise<EmailDocumentAuditMetadata> {
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

  private static async queryRelevantContext(
    env: EmailContextEnv,
    embedding: number[],
    vectorNamespace: string,
    enabledApplicationIds: Set<string>,
    excludedVectorId: string | undefined,
  ): Promise<string | undefined> {
    if (!env.EMAIL_CONTEXT_INDEX) return undefined;
    const queryTopK: number = ConfigurationUtil.getPositiveInteger(env.RAG_VECTOR_QUERY_TOP_K, DEFAULT_RAG_VECTOR_QUERY_TOP_K);
    const ragTopK: number = ConfigurationUtil.getPositiveInteger(env.RAG_TOP_K, DEFAULT_RAG_TOP_K);
    const maxContextChars: number = ConfigurationUtil.getPositiveInteger(env.MAX_RAG_CONTEXT_CHARS, DEFAULT_MAX_RAG_CONTEXT_CHARS);
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
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
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
