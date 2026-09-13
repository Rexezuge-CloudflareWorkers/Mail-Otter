import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DigestConfigService } from '@mail-otter/backend-services/digest';
import { DIGEST_ALL_SECTIONS } from '@mail-otter/shared/constants';

function makeDao(config: Record<string, string | null> = {}) {
  const store: Record<string, string | null> = { ...config };
  return {
    store,
    getProviderConfig: vi.fn(async (_app: string, key: string) => store[key] ?? null),
    setProviderConfig: vi.fn(async (_app: string, key: string, value: string) => {
      store[key] = value;
    }),
  };
}

function nowSendTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

describe('DigestConfigService branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns defaults for unconfigured applications', async () => {
    const dao = makeDao();
    const config = await new DigestConfigService(dao as never).getConfig('app-1');
    expect(config).toMatchObject({ enabled: false, sendTime: '08:00', sections: DIGEST_ALL_SECTIONS, lastSentAt: null });
  });

  it('normalizes invalid send times and unknown sections on save', async () => {
    const dao = makeDao();
    const svc = new DigestConfigService(dao as never);
    const config = await svc.saveConfig('app-1', { enabled: true, sendTime: '99:99', sections: ['calendar', 'nope'] });
    expect(config.sendTime).toBe('08:00');
    expect(config.sections).toEqual(['calendar']);
    expect(dao.store['digest_send_time']).toBe('08:00');
  });

  it('rejects malformed times on save', async () => {
    const dao = makeDao();
    const config = await new DigestConfigService(dao as never).saveConfig('app-1', {
      enabled: true,
      sendTime: '8:05',
      sections: [],
    });
    expect(config.sendTime).toBe('08:00');
  });

  it('reports due only inside the window and once per day', async () => {
    const dao = makeDao({ digest_enabled: 'true', digest_send_time: nowSendTime() });
    const svc = new DigestConfigService(dao as never);
    await expect(svc.isDueToSend('app-1', 'UTC')).resolves.toBe(true);
    await svc.markSent('app-1');
    await expect(svc.isDueToSend('app-1', 'UTC')).resolves.toBe(false);
  });

  it('is not due when disabled or outside the window', async () => {
    const disabled = makeDao({ digest_enabled: 'false', digest_send_time: nowSendTime() });
    await expect(new DigestConfigService(disabled as never).isDueToSend('app-1', 'UTC')).resolves.toBe(false);
    const offWindow = makeDao({ digest_enabled: 'true', digest_send_time: '00:00' });
    const now = new Date();
    const atMidnightWindow = now.getHours() === 0 && now.getMinutes() < 10;
    await expect(new DigestConfigService(offWindow as never).isDueToSend('app-1', 'UTC')).resolves.toBe(
      atMidnightWindow,
    );
  });

  it('forDatabase builds a service bound to the given database', async () => {
    const svc = DigestConfigService.forDatabase({} as never, 'key');
    expect(svc).toBeInstanceOf(DigestConfigService);
  });
});
