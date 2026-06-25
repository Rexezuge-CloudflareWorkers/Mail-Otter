import { ConnectedApplicationDAO, EmailActionDAO, SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import {
  DIGEST_BILLS_DUE_DAYS,
  DIGEST_APPOINTMENTS_HOURS,
  DIGEST_SECTION_APPOINTMENTS,
  DIGEST_SECTION_BILLS,
  DIGEST_SECTION_CALENDAR,
  DIGEST_SECTION_FLIGHTS,
  DIGEST_SECTION_PACKAGES,
  DIGEST_SECTION_TASKS,
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import type {
  AppointmentConfirmActionPayload,
  ConnectedApplicationMetadata,
  FinancePayBillActionPayload,
  SyncedCalendarEvent,
} from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { DigestConfigService } from './DigestConfigService';
import { DigestEmailUtil } from './DigestEmailUtil';
import type { DigestSections } from './DigestEmailUtil';

interface DigestServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

class DigestService {
  private readonly db: D1Queryable;
  private readonly masterKey: string;
  private readonly actionKey: string;

  constructor(private readonly env: DigestServiceEnv, masterKey: string, actionKey: string) {
    this.db = env.DB;
    this.masterKey = masterKey;
    this.actionKey = actionKey;
  }

  public async sendDigest(application: ConnectedApplicationMetadata, accessToken: string): Promise<void> {
    const configSvc = new DigestConfigService(new ConnectedApplicationDAO(this.db, this.masterKey));
    const config = await configSvc.getConfig(application.applicationId);
    if (!config.enabled) return;

    await this.buildAndSend(application, accessToken, config.sections, configSvc);
  }

  public async sendDigestForced(application: ConnectedApplicationMetadata, accessToken: string): Promise<void> {
    const configSvc = new DigestConfigService(new ConnectedApplicationDAO(this.db, this.masterKey));
    const config = await configSvc.getConfig(application.applicationId);

    await this.buildAndSend(application, accessToken, config.sections, configSvc);
  }

  private async buildAndSend(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    enabledSections: string[],
    configSvc: DigestConfigService,
  ): Promise<void> {
    const timeZone = application.timeZone || 'UTC';
    const now = new Date();
    const nowUnix = TimestampUtil.getCurrentUnixTimestampInSeconds();

    const sections = await this.buildSections(application.applicationId, enabledSections, timeZone, now, nowUnix);
    if (!DigestEmailUtil.hasContent(sections, enabledSections)) {
      await configSvc.markSent(application.applicationId);
      return;
    }

    const subject = DigestEmailUtil.buildSubject(now, timeZone);
    const htmlBody = DigestEmailUtil.buildHtml(sections, enabledSections);

    const to = application.providerEmail ?? '';
    if (!to) return;

    await DigestService.sendEmail(application, accessToken, to, subject, htmlBody);
    await configSvc.markSent(application.applicationId);
  }

  private async buildSections(
    applicationId: string,
    enabledSections: string[],
    timeZone: string,
    now: Date,
    nowUnix: number,
  ): Promise<DigestSections> {
    const actionDAO = new EmailActionDAO(this.db, this.actionKey);
    const calendarDAO = new SyncedCalendarEventDAO(this.db);

    const dayStartUnix = DigestService.getDayStartUnix(now, timeZone);
    const dayEndUnix = dayStartUnix + 86_400;
    const billsDueByUnix = nowUnix + DIGEST_BILLS_DUE_DAYS * 86_400;
    const appointmentsByUnix = nowUnix + DIGEST_APPOINTMENTS_HOURS * 3600;

    const [calendarEvents, tasks, packages, flights, allBills, allAppointments] = await Promise.all([
      enabledSections.includes(DIGEST_SECTION_CALENDAR)
        ? calendarDAO.listEventsForRange(applicationId, dayStartUnix, dayEndUnix)
        : Promise.resolve([] as SyncedCalendarEvent[]),
      enabledSections.includes(DIGEST_SECTION_TASKS)
        ? actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_MANUAL_TODO])
        : Promise.resolve([]),
      enabledSections.includes(DIGEST_SECTION_PACKAGES)
        ? actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE])
        : Promise.resolve([]),
      enabledSections.includes(DIGEST_SECTION_FLIGHTS)
        ? actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT])
        : Promise.resolve([]),
      enabledSections.includes(DIGEST_SECTION_BILLS)
        ? actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_FINANCE_PAY_BILL])
        : Promise.resolve([]),
      enabledSections.includes(DIGEST_SECTION_APPOINTMENTS)
        ? actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM])
        : Promise.resolve([]),
    ]);

    const bills = allBills.filter((a) => {
      const dueDate = (a.payload as FinancePayBillActionPayload).dueDate;
      if (!dueDate) return true;
      const dueDateUnix = Math.floor(new Date(dueDate).getTime() / 1000);
      return !Number.isNaN(dueDateUnix) && dueDateUnix <= billsDueByUnix;
    });

    const appointments = allAppointments.filter((a) => {
      const apptTime = (a.payload as AppointmentConfirmActionPayload).appointmentTime;
      if (!apptTime) return true;
      const apptUnix = Math.floor(new Date(apptTime).getTime() / 1000);
      return !Number.isNaN(apptUnix) && apptUnix <= appointmentsByUnix;
    });

    return { calendarEvents, tasks, packages, flights, bills, appointments };
  }

  private static getDayStartUnix(now: Date, timeZone: string): number {
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string): string => localParts.find((p) => p.type === type)?.value ?? '00';
    const dateStr = `${get('year')}-${get('month')}-${get('day')}T00:00:00`;
    return Math.floor(new Date(dateStr).getTime() / 1000);
  }

  private static async sendEmail(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    to: string,
    subject: string,
    htmlBody: string,
  ): Promise<void> {
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      await GmailProviderUtil.sendStandaloneEmail(accessToken, to, subject, htmlBody);
    } else if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      await OutlookProviderUtil.sendStandaloneEmail(accessToken, to, subject, htmlBody);
    }
  }
}

export { DigestService };
export type { DigestServiceEnv };
