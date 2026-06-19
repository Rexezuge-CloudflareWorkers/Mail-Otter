import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.fn();
const mockFirst = vi.fn();

import { UserDAO } from '@mail-otter/backend-data/dao';

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

describe('UserDAO', () => {
  let dao: UserDAO;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRun.mockReset().mockResolvedValue({ success: true });
    mockFirst.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    dao = new UserDAO(createMockDb() as unknown as D1Database);
  });

  describe('upsertByEmail', () => {
    it('inserts a new user and returns it', async () => {
      mockFirst.mockResolvedValue({ email: 'new@example.com', created_at: 1778198400, updated_at: 1778198400 });

      const user = await dao.upsertByEmail('new@example.com');

      expect(user.email).toBe('new@example.com');
      expect(mockRun).toHaveBeenCalled();
    });
  });

  describe('getByEmail', () => {
    it('returns user when found', async () => {
      mockFirst.mockResolvedValue({ email: 'existing@example.com', created_at: 1000, updated_at: 2000 });

      const user = await dao.getByEmail('existing@example.com');

      expect(user).toBeDefined();
      expect(user!.email).toBe('existing@example.com');
      expect(user!.createdAt).toBe(1000);
      expect(user!.updatedAt).toBe(2000);
    });

    it('returns undefined when user not found', async () => {
      mockFirst.mockResolvedValue(null);

      const user = await dao.getByEmail('nonexistent@example.com');

      expect(user).toBeUndefined();
    });
  });
});
