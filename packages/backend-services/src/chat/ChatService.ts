import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { ConnectedApplicationDAO, UserDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import { AppConfiguration } from '@mail-otter/backend-runtime/config';
import { AI_LANGUAGE_NAMES, formatBackendString, getBackendStrings } from '@mail-otter/shared/i18n';
import { LocaleUtil } from '@mail-otter/shared/utils';
import type { AiTextGenerationUsage } from '../email/WorkersAiResponseUtil';
import { WorkersAiResponseUtil } from '../email/WorkersAiResponseUtil';
import { EmailContextUtil } from '../email/EmailContextUtil';
import { AiService } from '../ai/AiService';

interface ChatServiceDeps {
  applicationDAO?: () => Promise<ConnectedApplicationDAO>;
  userDAO?: () => Promise<UserDAO>;
  aiService?: AiService;
  config?: AppConfiguration;
}

const REASONING_MODELS_REQUIRING_THINKING_DISABLED: ReadonlySet<string> = new Set<string>([
  '@cf/moonshotai/kimi-k2.6',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
  '@cf/google/gemma-4-26b-a4b-it',
]);

class ChatService {
  private readonly deps: Required<ChatServiceDeps>;

  constructor(
    private readonly env: ChatEnv,
    deps: ChatServiceDeps = {},
  ) {
    this.deps = {
      applicationDAO: async () => {
        const masterKey = this.env.AES_ENCRYPTION_KEY_SECRET ? await this.env.AES_ENCRYPTION_KEY_SECRET.get() : '';
        return new ConnectedApplicationDAO(this.env.DB, masterKey);
      },
      userDAO: () => Promise.resolve(new UserDAO(this.env.DB)),
      aiService: new AiService({ db: this.env.DB }),
      config: AppConfiguration.fromEnv(this.env),
      ...deps,
    };
  }

  public static async chat(input: ChatInput): Promise<ChatResult> {
    return new ChatService(input.env).chatForUser(input);
  }

  public async chatForUser(input: Omit<ChatInput, 'env'> & { env?: ChatEnv }): Promise<ChatResult> {
    const env = input.env ?? this.env;
    const { userEmail, query, applicationId, history } = input as ChatInput;
    return ChatService.runChat(env, this.deps, userEmail, query, applicationId, history);
  }

  private static async runChat(
    env: ChatEnv,
    deps: Required<ChatServiceDeps>,
    userEmail: string,
    query: string,
    applicationId?: string,
    history?: ChatMessage[],
  ): Promise<ChatResult> {
    if (!env.EMAIL_CONTEXT_INDEX) {
      throw new BadRequestError('Chat requires email context indexing to be enabled for at least one mailbox.');
    }

    if (await deps.aiService.shouldSkipForDailyUsage(env)) {
      throw new BadRequestError('Daily AI usage quota has been reached. Please try again tomorrow.');
    }

    const locale = await this.resolveLocaleWithDeps(env, deps, userEmail, applicationId);
    const strings = getBackendStrings(locale);

    const vectorNamespace = await EmailContextUtil.getUserVectorNamespace(userEmail);
    const embeddingModel = deps.config.getEmbeddingModel();
    const embedding = await deps.aiService.embed(env.AI, embeddingModel, query);
    await deps.aiService.recordEmbeddingUsage(embeddingModel, query, '[ChatService]');

    const vectorQueryTopK = deps.config.getChatVectorQueryTopK();
    const matches: VectorizeMatches = await env.EMAIL_CONTEXT_INDEX.query(embedding, {
      namespace: vectorNamespace,
      topK: vectorQueryTopK,
      returnMetadata: 'all',
    });

    const contextTopK = deps.config.getChatContextTopK();
    const filteredMatches: VectorizeMatch[] = applicationId
      ? matches.matches.filter((m) => deps.aiService.getStringMetadata(m.metadata, 'applicationId') === applicationId)
      : matches.matches;
    const topMatches: VectorizeMatch[] = filteredMatches.slice(0, contextTopK);

    const sources: ChatSource[] = topMatches.map((m) => ({
      vectorId: m.id,
      title: deps.aiService.getStringMetadata(m.metadata, 'title') ?? strings.summary.noSubject,
      sender: deps.aiService.getStringMetadata(m.metadata, 'sender') ?? strings.summary.unknownSender,
      applicationId: deps.aiService.getStringMetadata(m.metadata, 'applicationId') ?? '',
      score: m.score,
    }));

    const contextBlock = this.buildContextBlockWithDeps(deps, topMatches, locale);
    const systemPrompt = this.buildSystemPrompt(contextBlock, locale);

    const maxHistory = deps.config.getChatMaxHistoryMessages();
    const rawHistory = history ?? [];
    const trimmedHistory = rawHistory.length > maxHistory ? rawHistory.slice(-maxHistory) : rawHistory;
    const truncated = rawHistory.length > maxHistory;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory,
      { role: 'user', content: query },
    ];

    const chatModel = deps.config.getSummaryModel();
    const maxTokens = deps.config.getChatMaxResponseTokens();

    const aiRequest: AiChatRequest = { messages, max_tokens: maxTokens, temperature: 0.3 };
    if (REASONING_MODELS_REQUIRING_THINKING_DISABLED.has(chatModel)) {
      aiRequest.chat_template_kwargs = { thinking: false };
    }

    const result = await (env.AI as unknown as { run: (...args: unknown[]) => Promise<unknown> }).run(chatModel, aiRequest);
    const aiUsage: AiTextGenerationUsage | undefined = WorkersAiResponseUtil.extractUsage(result);
    const answerText = WorkersAiResponseUtil.extractResponseText(result) ?? strings.chat.noResponse;

    await this.recordTextGenerationUsageWithDeps(deps, env, chatModel, aiUsage, messages, answerText);

    return { answer: answerText, sources, truncated };
  }

  private static async resolveLocaleWithDeps(
    env: ChatEnv,
    deps: Required<ChatServiceDeps>,
    userEmail: string,
    applicationId?: string,
  ): Promise<string> {
    try {
      if (applicationId && env.AES_ENCRYPTION_KEY_SECRET) {
        const applicationDAO = await deps.applicationDAO();
        const application = await applicationDAO.getMetadataByIdForUser(applicationId, userEmail);
        if (application?.contentLanguage) return LocaleUtil.normalize(application.contentLanguage);
      }
      const userDAO = await deps.userDAO();
      const user = await userDAO.getByEmail(userEmail);
      if (user?.preferredLanguage) return LocaleUtil.normalize(user.preferredLanguage);
    } catch {
      // Fall through to default locale.
    }
    return 'en';
  }

  private static buildContextBlockWithDeps(
    deps: Required<ChatServiceDeps>,
    matches: VectorizeMatch[],
    locale?: string | null,
  ): string {
    const strings = getBackendStrings(locale);
    return matches
      .map((m, i) => {
        const title = deps.aiService.getStringMetadata(m.metadata, 'title') ?? strings.summary.noSubject;
        const sender = deps.aiService.getStringMetadata(m.metadata, 'sender') ?? strings.summary.unknownSender;
        const indexedText = deps.aiService.getStringMetadata(m.metadata, 'indexedText') ?? '';
        return [`${i + 1}. "${title}" from ${sender}`, indexedText].filter(Boolean).join('\n');
      })
      .join('\n\n');
  }

  private static async recordTextGenerationUsageWithDeps(
    deps: Required<ChatServiceDeps>,
    env: ChatEnv,
    model: string,
    usage: AiTextGenerationUsage | undefined,
    messages: Array<{ role: string; content: string }>,
    answerText: string,
  ): Promise<void> {
    const fallbackInput = messages.map((m) => m.content).join('\n');
    await deps.aiService.recordTextGenerationUsage(model, usage, fallbackInput, answerText, '[ChatService]');
  }

  private static buildSystemPrompt(contextBlock: string, locale?: string | null): string {
    const normalized = LocaleUtil.normalize(locale);
    const strings = getBackendStrings(normalized);
    const lines = [
      strings.chat.systemIntro1,
      strings.chat.systemIntro2,
      strings.chat.systemIntro3,
      strings.chat.systemIntro4,
    ];
    if (normalized !== 'en') {
      lines.push(formatBackendString(strings.chat.answerLanguageInstruction, { language: AI_LANGUAGE_NAMES[normalized] }));
    }
    if (contextBlock) {
      lines.push('', strings.chat.excerptsHeading, contextBlock);
    } else {
      lines.push('', strings.chat.noContext);
    }
    return lines.join('\n');
  }
}

interface ChatEnv {
  DB: D1Queryable;
  AI: Ai;
  AES_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret;
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

export { ChatService };
export type { ChatEnv, ChatMessage, ChatSource, ChatInput, ChatResult, ChatServiceDeps };
