import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import {
  DIGEST_ALL_SECTIONS,
  DIGEST_CONFIG_KEY_ENABLED,
  DIGEST_CONFIG_KEY_LAST_SENT_AT,
  DIGEST_CONFIG_KEY_SECTIONS,
  DIGEST_CONFIG_KEY_SEND_TIME,
} from '@mail-otter/shared/constants';
import type { DigestConfig } from '@mail-otter/shared/model';
import type { D1Queryable } from '@mail-otter/backend-data/utils';

const SEND_TIME_PATTERN = /^\d{2}:\d{2}$/;
const DIGEST_WINDOW_MINUTES = 10;

class DigestConfigService {
  constructor(private readonly dao: ConnectedApplicationDAO) {}

  public async getConfig(applicationId: string): Promise<DigestConfig> {
    const [enabledRaw, sendTime, sectionsRaw, lastSentAt] = await Promise.all([
      this.dao.getProviderConfig(applicationId, DIGEST_CONFIG_KEY_ENABLED),
      this.dao.getProviderConfig(applicationId, DIGEST_CONFIG_KEY_SEND_TIME),
      this.dao.getProviderConfig(applicationId, DIGEST_CONFIG_KEY_SECTIONS),
      this.dao.getProviderConfig(applicationId, DIGEST_CONFIG_KEY_LAST_SENT_AT),
    ]);
    return {
      enabled: enabledRaw === 'true',
      sendTime: sendTime ?? '08:00',
      sections: sectionsRaw ? (JSON.parse(sectionsRaw) as string[]) : DIGEST_ALL_SECTIONS,
      lastSentAt: lastSentAt ?? null,
    };
  }

  public async saveConfig(applicationId: string, config: Pick<DigestConfig, 'enabled' | 'sendTime' | 'sections'>): Promise<DigestConfig> {
    const normalizedTime = DigestConfigService.normalizeSendTime(config.sendTime);
    const validSections = config.sections.filter((s) => DIGEST_ALL_SECTIONS.includes(s));
    await Promise.all([
      this.dao.setProviderConfig(applicationId, DIGEST_CONFIG_KEY_ENABLED, config.enabled ? 'true' : 'false'),
      this.dao.setProviderConfig(applicationId, DIGEST_CONFIG_KEY_SEND_TIME, normalizedTime),
      this.dao.setProviderConfig(applicationId, DIGEST_CONFIG_KEY_SECTIONS, JSON.stringify(validSections)),
    ]);
    return this.getConfig(applicationId);
  }

  public async markSent(applicationId: string): Promise<void> {
    await this.dao.setProviderConfig(applicationId, DIGEST_CONFIG_KEY_LAST_SENT_AT, new Date().toISOString());
  }

  public async isDueToSend(applicationId: string, timeZone: string): Promise<boolean> {
    const config = await this.getConfig(applicationId);
    if (!config.enabled) return false;

    const now = new Date();
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const get = (type: string): string => localParts.find((p) => p.type === type)?.value ?? '00';
    const localHour = Number(get('hour'));
    const localMinute = Number(get('minute'));
    const localDateStr = `${get('year')}-${get('month')}-${get('day')}`;

    const [targetHour, targetMinute] = config.sendTime.split(':').map(Number);
    const currentMinutes = localHour * 60 + localMinute;
    const targetMinutes = targetHour * 60 + targetMinute;
    const inWindow = currentMinutes >= targetMinutes && currentMinutes < targetMinutes + DIGEST_WINDOW_MINUTES;

    if (!inWindow) return false;

    if (config.lastSentAt) {
      const lastSentDate = new Date(config.lastSentAt);
      const lastSentLocalParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(lastSentDate);
      const getL = (type: string): string => lastSentLocalParts.find((p) => p.type === type)?.value ?? '00';
      const lastSentDateStr = `${getL('year')}-${getL('month')}-${getL('day')}`;
      if (lastSentDateStr === localDateStr) return false;
    }

    return true;
  }

  private static normalizeSendTime(sendTime: string): string {
    if (!SEND_TIME_PATTERN.test(sendTime)) return '08:00';
    const [h, m] = sendTime.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) return '08:00';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

interface DigestConfigServiceDeps {
  db: D1Queryable;
  masterKey: string;
}

function createDigestConfigService({ db, masterKey }: DigestConfigServiceDeps): DigestConfigService {
  return new DigestConfigService(new ConnectedApplicationDAO(db, masterKey));
}

export { DigestConfigService, createDigestConfigService };
export type { DigestConfigServiceDeps };
