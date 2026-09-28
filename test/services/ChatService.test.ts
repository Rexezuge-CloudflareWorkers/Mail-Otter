import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from '@mail-otter/backend-services/chat';

/**
The account a chat request runs as: id for ownership, anchor for the vector namespace.
*/
const TEST_SCOPE = { id: 'usr_0123456789abcdef0123456789abcdef', anchorEmail: 'user@example.com' };

const { mockIncrementUsage, mockGetEstimatedNeurons, mockGetPreferredLanguage } = vi.hoisted(() => ({
  mockIncrementUsage: vi.fn(),
  mockGetEstimatedNeurons: vi.fn().mockResolvedValue(0),
  mockGetPreferredLanguage: vi.fn().mockResolvedValue({ preferredLanguage: null }),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  scopeForAnchor: (anchorEmail: string) => ({ id: null, anchorEmail }),
  userScopeSql: (scope: { id: string | null; anchorEmail: string }) =>
    scope.id
      ? { clause: '(user_id = ? OR (user_id IS NULL AND user_email = ?))', bindings: [scope.id, scope.anchorEmail] }
      : { clause: 'user_email = ?', bindings: [scope.anchorEmail] },
  AiDailyUsageDAO: vi.fn(function () {
    return {
      incrementUsage: mockIncrementUsage,
      getEstimatedNeuronsForDate: mockGetEstimatedNeurons,
    };
  }),
  UserDAO: vi.fn(function () {
    return { getByEmail: mockGetPreferredLanguage };
  }),
  ConnectedApplicationDAO: vi.fn(function () {
    return { getMetadataByIdForUser: vi.fn().mockResolvedValue(null) };
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
  };
}

function makeEnv(overrides?: Partial<ChatTestEnv>): ChatTestEnv {
  return {
    DB: {},
    AI: {
      run: vi.fn().mockResolvedValue({ response: 'Your package arrives Thursday.' }),
    },
    EMAIL_CONTEXT_INDEX: {
      query: vi.fn().mockResolvedValue({ matches: [makeMatch()] }),
    },
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

  it('derives the vector namespace from the frozen anchor, not the current address', async () => {
    // The namespace is persisted on every document row and stamped into every
    // existing vector. Deriving it from the account's *current* address would
    // make the user's own RAG context unreachable the moment they changed it --
    // silently, with no error, just empty results.
    const env = makeEnv();
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1]] });
    (env.EMAIL_CONTEXT_INDEX!.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ matches: [] });

    await ChatService.chat({ env, scope: TEST_SCOPE, query: 'test' });

    expect(mockGetUserVectorNamespace).toHaveBeenCalledWith(TEST_SCOPE.anchorEmail);
  });

  it('returns answer and sources on happy path', async () => {
    const env = makeEnv();
    // First call: embedding; second call: text generation (handled by default mockResolvedValue)
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1, 0.2, 0.3]] });

    const result = await ChatService.chat({
      env,
      scope: TEST_SCOPE,
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
      scope: TEST_SCOPE,
      query: 'test',
      applicationId: 'app-1',
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].applicationId).toBe('app-1');
  });

  it('reads the account locale through the frozen anchor, not the current address', async () => {
    // `users.email` is the PRIMARY KEY of `users`, so the anchor identifies the
    // account uniquely even after it has changed address.
    const env = makeEnv();
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1]] });
    (env.EMAIL_CONTEXT_INDEX!.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ matches: [] });
    mockGetPreferredLanguage.mockResolvedValueOnce('de');

    await ChatService.chat({ env, scope: TEST_SCOPE, query: 'test' });

    expect(mockGetPreferredLanguage).toHaveBeenCalledWith(TEST_SCOPE.anchorEmail);
  });

  it('falls back to the default locale when the account lookup fails', async () => {
    const env = makeEnv();
    (env.AI.run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: [[0.1]] });
    (env.EMAIL_CONTEXT_INDEX!.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ matches: [] });
    mockGetPreferredLanguage.mockRejectedValueOnce(new Error('db down'));

    // A missing locale must not fail the chat.
    const result = await ChatService.chat({ env, scope: TEST_SCOPE, query: 'test' });
    expect(result.answer).toBeDefined();
  });

  it('throws BadRequestError when EMAIL_CONTEXT_INDEX is not bound', async () => {
    const env = makeEnv({ EMAIL_CONTEXT_INDEX: undefined });

    await expect(ChatService.chat({ env, scope: TEST_SCOPE, query: 'test' })).rejects.toThrow('Chat requires email context indexing');
  });

  it('throws BadRequestError when daily quota is exceeded', async () => {
    const env = makeEnv({ AI_DAILY_NEURON_FALLBACK_THRESHOLD: '100' });
    mockGetEstimatedNeurons.mockResolvedValueOnce(200);

    await expect(ChatService.chat({ env, scope: TEST_SCOPE, query: 'test' })).rejects.toThrow('Daily AI usage quota');
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
      scope: TEST_SCOPE,
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
      scope: TEST_SCOPE,
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
      scope: TEST_SCOPE,
      query: 'any question',
    });

    expect(result.sources).toHaveLength(0);
    expect(typeof result.answer).toBe('string');
  });
});
