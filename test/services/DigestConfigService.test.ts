import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGetProviderConfig,
  mockSetProviderConfig,
} = vi.hoisted(() => ({
  mockGetProviderConfig: vi.fn(),
  mockSetProviderConfig: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  ConnectedApplicationDAO: vi.fn(function () {
    return {
      getProviderConfig: mockGetProviderConfig,
      setProviderConfig: mockSetProviderConfig,
    };
  }),
}));

import { DigestConfigService, createDigestConfigService } from '../../packages/backend-services/src/digest/DigestConfigService';
import { DIGEST_ALL_SECTIONS } from '@mail-otter/shared/constants';

const APP_ID = 'app-1';

describe('DigestConfigService', () => {
  let service: DigestConfigService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createDigestConfigService({ db: {} as D1Database, masterKey: 'mk' });
  });

  describe('getConfig', () => {
    it('returns defaults when no config rows exist', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      const config = await service.getConfig(APP_ID);

      expect(config.enabled).toBe(false);
      expect(config.sendTime).toBe('08:00');
      expect(config.sections).toEqual(DIGEST_ALL_SECTIONS);
      expect(config.lastSentAt).toBeNull();
    });

    it('returns stored enabled:true', async () => {
      mockGetProviderConfig
        .mockResolvedValueOnce('true')   // enabled
        .mockResolvedValueOnce('09:30')  // sendTime
        .mockResolvedValueOnce(JSON.stringify(['calendar', 'tasks']))  // sections
        .mockResolvedValueOnce('2026-06-25T09:30:00.000Z');  // lastSentAt

      const config = await service.getConfig(APP_ID);

      expect(config.enabled).toBe(true);
      expect(config.sendTime).toBe('09:30');
      expect(config.sections).toEqual(['calendar', 'tasks']);
      expect(config.lastSentAt).toBe('2026-06-25T09:30:00.000Z');
    });

    it('returns enabled:false for non-"true" value', async () => {
      mockGetProviderConfig.mockResolvedValueOnce('false').mockResolvedValue(null);

      const config = await service.getConfig(APP_ID);
      expect(config.enabled).toBe(false);
    });
  });

  describe('saveConfig', () => {
    it('saves enabled, sendTime, and sections', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await service.saveConfig(APP_ID, { enabled: true, sendTime: '07:00', sections: ['calendar', 'tasks'] });

      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_enabled', 'true');
      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_send_time', '07:00');
      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_sections', JSON.stringify(['calendar', 'tasks']));
    });

    it('normalizes invalid sendTime to 08:00', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await service.saveConfig(APP_ID, { enabled: false, sendTime: 'not-a-time', sections: [] });

      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_send_time', '08:00');
    });

    it('normalizes sendTime with out-of-range hour', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await service.saveConfig(APP_ID, { enabled: false, sendTime: '25:00', sections: [] });

      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_send_time', '08:00');
    });

    it('normalizes sendTime with out-of-range minute', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await service.saveConfig(APP_ID, { enabled: false, sendTime: '08:99', sections: [] });

      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_send_time', '08:00');
    });

    it('pads single-digit hours and minutes', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await service.saveConfig(APP_ID, { enabled: false, sendTime: '09:05', sections: [] });

      expect(mockSetProviderConfig).toHaveBeenCalledWith(APP_ID, 'digest_send_time', '09:05');
    });

    it('filters out invalid sections', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      await service.saveConfig(APP_ID, { enabled: false, sendTime: '08:00', sections: ['calendar', 'invalid_section', 'tasks'] });

      const sectionsCall = mockSetProviderConfig.mock.calls.find((c) => c[1] === 'digest_sections');
      expect(sectionsCall).toBeDefined();
      const saved = JSON.parse(sectionsCall![2] as string) as string[];
      expect(saved).toContain('calendar');
      expect(saved).toContain('tasks');
      expect(saved).not.toContain('invalid_section');
    });
  });

  describe('markSent', () => {
    it('sets last_sent_at to current ISO timestamp', async () => {
      const before = Date.now();
      await service.markSent(APP_ID);
      const after = Date.now();

      expect(mockSetProviderConfig).toHaveBeenCalledOnce();
      const [, key, value] = mockSetProviderConfig.mock.calls[0] as [string, string, string];
      expect(key).toBe('digest_last_sent_at');
      const ts = new Date(value).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });
  });

  describe('isDueToSend', () => {
    it('returns false when digest is disabled', async () => {
      mockGetProviderConfig.mockResolvedValue(null);

      const result = await service.isDueToSend(APP_ID, 'UTC');
      expect(result).toBe(false);
    });

    it('returns true when in the send window and not yet sent today', async () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${hh}:${mm}`;

      mockGetProviderConfig
        .mockResolvedValueOnce('true')
        .mockResolvedValueOnce(sendTime)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.isDueToSend(APP_ID, 'UTC');
      expect(result).toBe(true);
    });

    it('returns false when not in the send window', async () => {
      mockGetProviderConfig
        .mockResolvedValueOnce('true')
        .mockResolvedValueOnce('03:00')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.isDueToSend(APP_ID, 'UTC');
      expect(result).toBe(false);
    });

    it('returns false when already sent today', async () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${hh}:${mm}`;
      const todayIso = now.toISOString();

      mockGetProviderConfig
        .mockResolvedValueOnce('true')
        .mockResolvedValueOnce(sendTime)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(todayIso);

      const result = await service.isDueToSend(APP_ID, 'UTC');
      expect(result).toBe(false);
    });

    it('returns true when sent yesterday (different calendar day)', async () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const sendTime = `${hh}:${mm}`;

      const yesterday = new Date(now.getTime() - 86_400_000);
      const yesterdayIso = yesterday.toISOString();

      mockGetProviderConfig
        .mockResolvedValueOnce('true')
        .mockResolvedValueOnce(sendTime)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(yesterdayIso);

      const result = await service.isDueToSend(APP_ID, 'UTC');
      expect(result).toBe(true);
    });
  });
});
