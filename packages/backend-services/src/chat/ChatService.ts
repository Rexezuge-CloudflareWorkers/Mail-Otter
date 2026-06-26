import { AiDailyUsageDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { AiUsageUtil } from '../email/AiUsageUtil';
import type { AiTextGenerationUsage } from '../email/WorkersAiResponseUtil';
import { WorkersAiResponseUtil } from '../email/WorkersAiResponseUtil';
import { EmailContextUtil } from '../email/EmailContextUtil';

const REASONING_MODELS_REQUIRING_THINKING_DISABLED: ReadonlySet<string> = new Set<string>([
  '@cf/moonshotai/kimi-k2.6',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
]);

class ChatService {
  public static async chat(input: ChatInput): Promise<ChatResult> {
    const { env, userEmail, query, applicationId, history } = input;

    if (!env.EMAIL_CONTEXT_INDEX) {
      throw new BadRequestError('Chat requires email context indexing to be enabled for at least one mailbox.');
    }

    if (await this.shouldSkipForDailyUsage(env)) {
      throw new BadRequestError('Daily AI usage quota has been reached. Please try again tomorrow.');
    }

    const vectorNamespace = await EmailContextUtil.getUserVectorNamespace(userEmail);
    const embeddingModel = ConfigurationManager.getAiEmbeddingModel(env);
    const embedding = await this.embed(env.AI, embeddingModel, query);
    await this.recordEmbeddingUsage(env, embeddingModel, query);

    const vectorQueryTopK = ConfigurationManager.chat.getVectorQueryTopK(env);
    const matches: VectorizeMatches = await env.EMAIL_CONTEXT_INDEX.query(embedding, {
      namespace: vectorNamespace,
      topK: vectorQueryTopK,
      returnMetadata: 'all',
    });

    const contextTopK = ConfigurationManager.chat.getContextTopK(env);
    const filteredMatches: VectorizeMatch[] = applicationId
      ? matches.matches.filter((m) => this.getStringMetadata(m.metadata, 'applicationId') === applicationId)
      : matches.matches;
    const topMatches: VectorizeMatch[] = filteredMatches.slice(0, contextTopK);

    const sources: ChatSource[] = topMatches.map((m) => ({
      vectorId: m.id,
      title: this.getStringMetadata(m.metadata, 'title') ?? '(no subject)',
      sender: this.getStringMetadata(m.metadata, 'sender') ?? '(unknown sender)',
      applicationId: this.getStringMetadata(m.metadata, 'applicationId') ?? '',
      score: m.score,
    }));

    const contextBlock = this.buildContextBlock(topMatches);
    const systemPrompt = this.buildSystemPrompt(contextBlock);

    const maxHistory = ConfigurationManager.chat.getMaxHistoryMessages(env);
    const rawHistory = history ?? [];
    const trimmedHistory = rawHistory.length > maxHistory ? rawHistory.slice(-maxHistory) : rawHistory;
    const truncated = rawHistory.length > maxHistory;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory,
      { role: 'user', content: query },
    ];

    const chatModel = ConfigurationManager.getEmailSummaryModel(env);
    const maxTokens = ConfigurationManager.chat.getMaxResponseTokens(env);

    const aiRequest: AiChatRequest = { messages, max_tokens: maxTokens, temperature: 0.3 };
    if (REASONING_MODELS_REQUIRING_THINKING_DISABLED.has(chatModel)) {
      aiRequest.chat_template_kwargs = { thinking: false };
    }

    const result = await (env.AI as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(chatModel, aiRequest);
    const aiUsage: AiTextGenerationUsage | undefined = WorkersAiResponseUtil.extractUsage(result);
    const answerText = WorkersAiResponseUtil.extractResponseText(result) ?? 'No response from AI.';

    await this.recordTextGenerationUsage(env, chatModel, aiUsage, messages, answerText);

    return { answer: answerText, sources, truncated };
  }

  private static buildSystemPrompt(contextBlock: string): string {
    const lines = [
      "You are a helpful assistant that answers questions about the user's emails.",
      'Answer concisely and factually, drawing only on the provided email excerpts below.',
      'If the excerpts do not contain relevant information, say so clearly.',
      'Never invent email content or fabricate facts.',
    ];
    if (contextBlock) {
      lines.push('', '--- Email Excerpts ---', contextBlock);
    } else {
      lines.push('', 'No relevant email context was found for this query.');
    }
    return lines.join('\n');
  }

  private static buildContextBlock(matches: VectorizeMatch[]): string {
    return matches
      .map((m, i) => {
        const title = this.getStringMetadata(m.metadata, 'title') ?? '(no subject)';
        const sender = this.getStringMetadata(m.metadata, 'sender') ?? '(unknown sender)';
        const indexedText = this.getStringMetadata(m.metadata, 'indexedText') ?? '';
        return [`${i + 1}. "${title}" from ${sender}`, indexedText].filter(Boolean).join('\n');
      })
      .join('\n\n');
  }

  private static async embed(ai: Ai, model: string, text: string): Promise<number[]> {
    const result = (await ai.run(model, { text: [text] })) as WorkersAiEmbeddingResult;
    const embedding: unknown = Array.isArray(result.data?.[0]) ? result.data[0] : result.data;
    if (!Array.isArray(embedding) || !embedding.every((item: unknown): item is number => typeof item === 'number')) {
      throw new Error('Workers AI did not return an embedding vector.');
    }
    return embedding;
  }

  private static async recordEmbeddingUsage(env: ChatEnv, model: string, text: string): Promise<void> {
    try {
      const estimate = AiUsageUtil.estimateEmbeddingUsage(model, text);
      await new AiDailyUsageDAO(env.DB).incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        embeddingTokens: estimate.embeddingTokens,
      });
    } catch (error: unknown) {
      console.warn('Failed to record AI embedding usage for chat:', error);
    }
  }

  private static async recordTextGenerationUsage(
    env: ChatEnv,
    model: string,
    usage: AiTextGenerationUsage | undefined,
    messages: Array<{ role: string; content: string }>,
    answerText: string,
  ): Promise<void> {
    try {
      const fallbackInput = messages.map((m) => m.content).join('\n');
      const estimate = AiUsageUtil.estimateTextGenerationUsage(model, usage, fallbackInput, answerText);
      await new AiDailyUsageDAO(env.DB).incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        promptTokens: estimate.promptTokens,
        completionTokens: estimate.completionTokens,
      });
    } catch (error: unknown) {
      console.warn('Failed to record AI text generation usage for chat:', error);
    }
  }

  private static async shouldSkipForDailyUsage(env: ChatEnv): Promise<boolean> {
    const fallbackThreshold = ConfigurationManager.getAiDailyNeuronFallbackThreshold(env);
    if (fallbackThreshold <= 0) return false;
    try {
      const estimatedNeurons = await new AiDailyUsageDAO(env.DB).getEstimatedNeuronsForDate(
        AiUsageUtil.getCurrentUtcUsageDate(),
      );
      return estimatedNeurons >= fallbackThreshold;
    } catch (error: unknown) {
      console.warn('Failed to read AI daily usage for chat:', error);
      return false;
    }
  }

  private static getStringMetadata(
    metadata: Record<string, VectorizeVectorMetadata> | undefined,
    key: string,
  ): string | undefined {
    const value: VectorizeVectorMetadata | undefined = metadata?.[key];
    return typeof value === 'string' ? value : undefined;
  }
}

interface ChatEnv {
  DB: D1Queryable;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  AI_EMBEDDING_MODEL?: string;
  AI_SUMMARY_MODEL?: string;
  CHAT_MAX_RESPONSE_TOKENS?: string;
  CHAT_VECTOR_QUERY_TOP_K?: string;
  CHAT_CONTEXT_TOP_K?: string;
  CHAT_MAX_HISTORY_MESSAGES?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSource {
  vectorId: string;
  title: string;
  sender: string;
  applicationId: string;
  score: number;
}

interface ChatInput {
  env: ChatEnv;
  userEmail: string;
  query: string;
  applicationId?: string;
  history?: ChatMessage[];
}

interface ChatResult {
  answer: string;
  sources: ChatSource[];
  truncated: boolean;
}

interface AiChatRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  max_tokens: number;
  temperature: number;
  chat_template_kwargs?: { thinking: boolean };
}

interface WorkersAiEmbeddingResult {
  data?: number[] | number[][];
}

export { ChatService };
export type { ChatEnv, ChatMessage, ChatSource, ChatInput, ChatResult };
