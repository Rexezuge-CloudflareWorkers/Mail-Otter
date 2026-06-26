import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNow = 1_778_200_000;
const mockUUID = 'sync-evt-uuid-1';

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => mockNow) },
  UUIDUtil: { getRandomUUID: vi.fn(() => mockUUID) },
}));

import { SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';

function makeDb(overrides?: { allResults?: unknown[]; runMeta?: { changes: number } }): D1Database {
  const runFn = vi.fn().mockResolvedValue({ success: true, meta: overrides?.runMeta ?? { changes: 1 } });
  const allFn = vi.fn().mockResolvedValue({ results: overrides?.allResults ?? [] });
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ run: runFn, all: allFn })),
    })),
  };
}

function makeEventRow(overrides?: Record<string, unknown>) {
  return {
    sync_event_id: mockUUID,
    application_id: 'app-1',
    provider_event_id: 'provider-evt-1',
    event_title: 'Team Standup',
    start_time: mockNow + 3600,
    end_time: mockNow + 7200,
    time_zone: 'America/New_York',
    location: 'Zoom',
    notes: 'Daily sync',
    synced_at: mockNow,
    ...overrides,
  };
}

describe('SyncedCalendarEventDAO', () => {
  let dao: SyncedCalendarEventDAO;
  let db: D1Database;

  beforeEach(() => {
    vi.clearAllMocks();
    db = makeDb();
    dao = new SyncedCalendarEventDAO(db);
  });

  describe('upsertEvents', () => {
    it('does nothing when events array is empty', async () => {
      await dao.upsertEvents('app-1', []);
      expect((db.prepare as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    });

    it('inserts a single event', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new SyncedCalendarEventDAO(db);

      await dao.upsertEvents('app-1', [
        {
          providerEventId: 'provider-evt-1',
          eventTitle: 'Team Standup',
          startTime: mockNow + 3600,
          endTime: mockNow + 7200,
          timeZone: 'UTC',
        },
      ]);
      expect(runFn).toHaveBeenCalledOnce();
    });

    it('inserts multiple events with separate queries', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new SyncedCalendarEventDAO(db);

      await dao.upsertEvents('app-1', [
        { providerEventId: 'evt-1', eventTitle: 'Meeting 1', startTime: mockNow, endTime: mockNow + 3600, timeZone: 'UTC' },
        { providerEventId: 'evt-2', eventTitle: 'Meeting 2', startTime: mockNow + 7200, endTime: mockNow + 10800, timeZone: 'UTC' },
      ]);
      expect(runFn).toHaveBeenCalledTimes(2);
    });

    it('passes optional location and notes', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new SyncedCalendarEventDAO(db);

      await dao.upsertEvents('app-1', [
        {
          providerEventId: 'evt-1',
          eventTitle: 'Doctor Appointment',
          startTime: mockNow,
          endTime: mockNow + 3600,
          timeZone: 'UTC',
          location: 'Clinic',
          notes: 'Annual checkup',
        },
      ]);
      const args = bindFn.mock.calls[0];
      expect(args).toContain('Clinic');
      expect(args).toContain('Annual checkup');
    });

    it('uses null for missing optional fields', async () => {
      const bindFn = vi.fn();
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } });
      db = {
        prepare: vi.fn(() => ({
          bind: bindFn.mockReturnValue({ run: runFn }),
        })),
      };
      dao = new SyncedCalendarEventDAO(db);

      await dao.upsertEvents('app-1', [
        { providerEventId: 'evt-1', eventTitle: 'No Details', startTime: mockNow, endTime: mockNow + 3600, timeZone: 'UTC' },
      ]);
      const args = bindFn.mock.calls[0];
      expect(args).toContain(null); // location and notes are null
    });
  });

  describe('listEventsForRange', () => {
    it('returns empty array when no events in range', async () => {
      const events = await dao.listEventsForRange('app-1', mockNow, mockNow + 86400);
      expect(events).toHaveLength(0);
    });

    it('returns mapped events', async () => {
      db = makeDb({ allResults: [makeEventRow()] });
      dao = new SyncedCalendarEventDAO(db);

      const events = await dao.listEventsForRange('app-1', mockNow, mockNow + 86400);
      expect(events).toHaveLength(1);
      expect(events[0].syncEventId).toBe(mockUUID);
      expect(events[0].eventTitle).toBe('Team Standup');
      expect(events[0].timeZone).toBe('America/New_York');
    });
  });

  describe('listForUser', () => {
    it('returns empty list when no events', async () => {
      const result = await dao.listForUser('user@example.com');
      expect(result.events).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    });

    it('returns mapped events for user', async () => {
      db = makeDb({ allResults: [makeEventRow()] });
      dao = new SyncedCalendarEventDAO(db);

      const result = await dao.listForUser('user@example.com');
      expect(result.events).toHaveLength(1);
      expect(result.events[0].providerEventId).toBe('provider-evt-1');
      expect(result.events[0].location).toBe('Zoom');
      expect(result.events[0].notes).toBe('Daily sync');
    });

    it('filters by applicationId', async () => {
      db = makeDb({ allResults: [] });
      dao = new SyncedCalendarEventDAO(db);

      await dao.listForUser('user@example.com', { applicationId: 'app-1' });
      expect((db.prepare as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('provides nextCursor when more rows than limit', async () => {
      const rows = Array.from({ length: 26 }, (_, i) =>
        makeEventRow({ sync_event_id: `evt-${i}`, synced_at: mockNow - i }),
      );
      db = makeDb({ allResults: rows });
      dao = new SyncedCalendarEventDAO(db);

      const result = await dao.listForUser('user@example.com', { limit: 25 });
      expect(result.events).toHaveLength(25);
      expect(result.nextCursor).toBeDefined();
    });

    it('applies cursor for pagination', async () => {
      const cursor = btoa(JSON.stringify({ syncedAt: mockNow - 100, syncEventId: 'some-evt' }));
      db = makeDb({ allResults: [] });
      dao = new SyncedCalendarEventDAO(db);

      const result = await dao.listForUser('user@example.com', { cursor });
      expect(result.events).toHaveLength(0);
    });

    it('ignores invalid cursor gracefully', async () => {
      const result = await dao.listForUser('user@example.com', { cursor: '!!!invalid' });
      expect(result.events).toHaveLength(0);
    });

    it('clamps limit to 50', async () => {
      const rows = Array.from({ length: 51 }, (_, i) => makeEventRow({ sync_event_id: `evt-${i}` }));
      db = makeDb({ allResults: rows });
      dao = new SyncedCalendarEventDAO(db);

      const result = await dao.listForUser('user@example.com', { limit: 100 });
      expect(result.events).toHaveLength(50);
    });
  });

  describe('pruneOldEvents', () => {
    it('returns number of deleted events', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 4 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new SyncedCalendarEventDAO(db);

      const count = await dao.pruneOldEvents(mockNow - 86_400 * 7, 100);
      expect(count).toBe(4);
    });

    it('returns 0 when nothing pruned', async () => {
      const runFn = vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } });
      db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runFn })),
        })),
      };
      dao = new SyncedCalendarEventDAO(db);

      const count = await dao.pruneOldEvents(mockNow - 86_400 * 7, 100);
      expect(count).toBe(0);
    });
  });
});
