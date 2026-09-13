import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mail-otter/backend-data/crypto', () => ({
  encryptDataWithSalt: vi.fn(async () => ({ encrypted: 'e', iv: 'i', salt: 's' })),
  decryptDataWithSalt: vi.fn(async () => JSON.stringify({ title: 't', description: 'd' })),
}));

vi.mock('@mail-otter/shared/utils', () => ({
  TimestampUtil: { getCurrentUnixTimestampInSeconds: vi.fn(() => 1_000) },
}));

import { EmailActionDAO } from '@mail-otter/backend-data/dao';

function makeDb(changes: number, allResults: unknown[] = []) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ success: true, meta: { changes } })),
        all: vi.fn(async () => ({ results: allResults })),
        first: vi.fn(async () => null),
      })),
    })),
  };
}

describe('EmailActionDAO snooze and schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('snoozes and cancels snooze based on affected rows', async () => {
    const dao = new EmailActionDAO(makeDb(1) as never, 'key');
    await expect(dao.snoozeAction('a-1', 200, 300)).resolves.toBe(true);
    await expect(dao.cancelSnooze('a-1')).resolves.toBe(true);
    const missed = new EmailActionDAO(makeDb(0) as never, 'key');
    await expect(missed.snoozeAction('a-1', 200, 300)).resolves.toBe(false);
    await expect(missed.cancelSnooze('a-1')).resolves.toBe(false);
  });

  it('schedules and cancels schedule based on affected rows', async () => {
    const dao = new EmailActionDAO(makeDb(1) as never, 'key');
    await expect(dao.scheduleAction('a-1', 200, 300)).resolves.toBe(true);
    await expect(dao.cancelSchedule('a-1')).resolves.toBe(true);
    const missed = new EmailActionDAO(makeDb(0) as never, 'key');
    await expect(missed.scheduleAction('a-1', 200, 300)).resolves.toBe(false);
    await expect(missed.cancelSchedule('a-1')).resolves.toBe(false);
  });

  it('lists pending scheduled actions due now', async () => {
    const row = {
      action_id: 'a-1',
      processed_message_id: 'pm-1',
      application_id: 'app-1',
      user_email: 'u@x',
      provider_id: 'google-gmail',
      provider_message_id: 'm-1',
      provider_thread_id: null,
      action_type: 'reply',
      status: 'pending',
      risk_level: 'low',
      token_hash: 'h',
      encrypted_payload: 'e',
      payload_iv: 'i',
      payload_salt: 's',
      encrypted_result: null,
      result_iv: null,
      result_salt: null,
      error_message: null,
      sync_status: null,
      snoozed_until: null,
      scheduled_for: 900,
      expires_at: 2000,
      executed_at: null,
      created_at: 500,
      updated_at: 500,
    };
    const dao = new EmailActionDAO(makeDb(0, [row]) as never, 'key');
    const actions = await dao.listPendingScheduledActions(1000, 10);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ actionId: 'a-1', status: 'pending' });
    const empty = new EmailActionDAO(makeDb(0, []) as never, 'key');
    await expect(empty.listPendingScheduledActions(1000, 10)).resolves.toEqual([]);
  });
});
