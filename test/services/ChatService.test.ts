import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from '@mail-otter/backend-services/chat';

const {
  mockIncrementUsage,
  mockGetEstimatedNeurons,
} = vi.hoisted(() => ({
  mockIncrementUsage: vi.fn(),
  mockGetEstimatedNeurons: vi.fn().mockResolvedValue(0),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  AiDailyUsageDAO: vi.fn(function () {
    return {
      incrementUsage: mockIncrementUsage,
      getEstimatedNeuronsForDate: mockGetEstimatedNeurons,
    };
  }),
}));

const { mockGetUserVectorNamespace } = vi.hoisted(() => ({
  mockGetUserVectorNamespace: vi.fn().mockResolvedValue('u_testhash'),
}));

vi.mock('../../packages/backend-services/src/email/EmailContextUtil', () => ({
  EmailContextUtil: {
    getUserVectorNamespace: mockGetUserVectorNamespace,
  },
}));

function makeMatch(overrides?: Partial<VectorizeMatch>): VectorizeMatch {
  return {
    id: 'cd_doc1',
    score: 0.9,
    metadata: {
      title: 'Package Shipped',
      sender: 'amazon@amazon.com',
      applicationId: 'app-1',
      indexedText: 'Your package is on its way.',
    },
    values: [],
    ...overrides,
  } as unknown as VectorizeMatch;
}

function makeEnv(overrides?: Partial<ChatTestEnv>): ChatTestEnv {
  return {
    DB: {} as unknown as D1Database,
    AI: {
      run: vi.fn().mockResolvedValue({ response: 'Your package arrives Thursday.' }),
    } as unknown as Ai,
    EMAIL_CONTEXT_INDEX: {
      query: vi.fn().mockResolvedValue({ matches: [makeMatch()] }),
    } as unknown as Vectorize,
    AI_EMBEDDING_MODEL: '@cf/baai/bge-m3',
    AI_SUMMARY_MODEL: '@cf/openai/gpt-oss-20b',
    AI_DAILY_NEURON_FALLBACK_THRESHOLD: '10000',
    ...overrides,
  };
}

interface ChatTestEnv {
  DB: D1Database;
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  AI_EMBEDDING_MODEL?: string;
  AI_SUMMARY_MODEL?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
}

describe('ChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEstimatedNeurons.mockResolvedValue(0);
  });

  it('returns answer and sources on happy path', async () => {
    const env = makeEnv();
    // First call: embedding; second call: text generation (handled by default mockResolvedValue)
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1, 0.2, 0.3]] });

    const result = await ChatService.chat({
      env,
      userEmail: 'user@example.com',
      query: 'What packages am I expecting?',
    });

    expect(result.answer).toBe('Your package arrives Thursday.');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].title).toBe('Package Shipped');
    expect(result.sources[0].sender).toBe('amazon@amazon.com');
    expect(result.sources[0].applicationId).toBe('app-1');
    expect(result.truncated).toBe(false);
    expect(mockIncrementUsage).toHaveBeenCalled();
  });

  it('filters matches by applicationId when provided', async () => {
    const env = makeEnv();
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1, 0.2]] });
    (env.EMAIL_CONTEXT_INDEX!.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      matches: [
        makeMatch({ metadata: { applicationId: 'app-1', title: 'A', sender: 'a@a.com', indexedText: 'text' } }),
        makeMatch({ id: 'cd_doc2', metadata: { applicationId: 'app-2', title: 'B', sender: 'b@b.com', indexedText: 'text2' } }),
      ],
    });

    const result = await ChatService.chat({
      env,
      userEmail: 'user@example.com',
      query: 'test',
      applicationId: 'app-1',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].applicationId).toBe('app-1');
  });

  it('throws BadRequestError when EMAIL_CONTEXT_INDEX is not bound', async () => {
    const env = makeEnv({ EMAIL_CONTEXT_INDEX: undefined });

    await expect(
      ChatService.chat({ env, userEmail: 'user@example.com', query: 'test' }),
    ).rejects.toThrow('Chat requires email context indexing');
  });

  it('throws BadRequestError when daily quota is exceeded', async () => {
    const env = makeEnv({ AI_DAILY_NEURON_FALLBACK_THRESHOLD: '100' });
    mockGetEstimatedNeurons.mockResolvedValueOnce(200);

    await expect(
      ChatService.chat({ env, userEmail: 'user@example.com', query: 'test' }),
    ).rejects.toThrow('Daily AI usage quota');
  });

  it('sets truncated:true when history exceeds max', async () => {
    const env = makeEnv({ CHAT_MAX_HISTORY_MESSAGES: '2' } as unknown as Partial<ChatTestEnv>);
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1]] });

    const history = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'response' },
      { role: 'user' as const, content: 'second' },
    ];

    const result = await ChatService.chat({
      env,
      userEmail: 'user@example.com',
      query: 'third question',
      history,
    });

    expect(result.truncated).toBe(true);
  });

  it('returns truncated:false when history is within limit', async () => {
    const env = makeEnv();
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1]] });

    const history = [{ role: 'user' as const, content: 'previous' }];

    const result = await ChatService.chat({
      env,
      userEmail: 'user@example.com',
      query: 'follow-up',
      history,
    });

    expect(result.truncated).toBe(false);
  });

  it('handles empty Vectorize results gracefully', async () => {
    const env = makeEnv();
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1]] });
    (env.EMAIL_CONTEXT_INDEX!.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ matches: [] });

    const result = await ChatService.chat({
      env,
      userEmail: 'user@example.com',
      query: 'any question',
    });

    expect(result.sources).toHaveLength(0);
    expect(typeof result.answer).toBe('string');
  });
});
