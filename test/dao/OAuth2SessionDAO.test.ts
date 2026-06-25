import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.fn();
const mockFirst = vi.fn();

vi.mock('@mail-otter/shared/utils', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('@mail-otter/shared/utils');
  return {
    ...actual,
    UUIDUtil: {
      ...actual.UUIDUtil,
      getRandomUUID: () => 'mock-session-uuid',
    },
  };
});

import { OAuth2AuthorizationSessionDAO } from '@mail-otter/backend-data/dao';

function createMockDb(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: mockRun,
        first: mockFirst,
      })),
    })),
    batch: vi.fn(),
  };
}

describe('OAuth2AuthorizationSessionDAO', () => {
  let dao: OAuth2AuthorizationSessionDAO;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRun.mockReset().mockResolvedValue({ success: true });
    mockFirst.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    dao = new OAuth2AuthorizationSessionDAO(createMockDb());
  });

  describe('create', () => {
    it('inserts a new authorization session', async () => {
      await dao.create('app-1', 'state-hash', 'code-verifier', 'https://callback.example.com', 9_999_999_999);

      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('getActive', () => {
    it('returns active session when found', async () => {
      mockFirst.mockResolvedValue({
        session_id: 'sess-1',
        application_id: 'app-1',
        state_hash: 'state-hash',
        code_verifier: 'code-verifier',
        redirect_uri: 'https://example.com/callback',
        created_at: 1000,
        expires_at: 9_999_999_999,
        consumed_at: null,
      });

      const session = await dao.getActive('app-1', 'state-hash');

      expect(session).toBeDefined();
      expect(session!.sessionId).toBe('sess-1');
      expect(session!.consumedAt).toBeNull();
    });

    it('returns undefined when no active session exists', async () => {
      mockFirst.mockResolvedValue(null);

      const session = await dao.getActive('app-1', 'nonexistent-hash');

      expect(session).toBeUndefined();
    });
  });

  describe('deleteExpiredSessions', () => {
    it('deletes expired sessions and returns count', async () => {
      mockRun.mockResolvedValue({ success: true, meta: { changes: 5 } });

      const count = await dao.deleteExpiredSessions(100);

      expect(count).toBe(5);
    });

    it('returns 0 when no expired sessions', async () => {
      mockRun.mockResolvedValue({ success: true, meta: { changes: 0 } });

      const count = await dao.deleteExpiredSessions(100);

      expect(count).toBe(0);
    });
  });

  describe('consume', () => {
    it('marks a session as consumed', async () => {
      await dao.consume('sess-1');

      expect(mockRun).toHaveBeenCalled();
    });
  });
});
