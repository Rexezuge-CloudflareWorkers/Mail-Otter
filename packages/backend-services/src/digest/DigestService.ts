import { ConnectedApplicationDAO, EmailActionDAO, SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import {
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
} from '@mail-otter/shared/constants';
import type {
  ConnectedApplicationMetadata,
  SyncedCalendarEvent,
} from '@mail-otter/shared/model';
import { TimestampUtil } from '@mail-otter/shared/utils';
import { DigestConfigService } from './DigestConfigService';
import { DigestEmailBuilder } from './DigestEmailBuilder';
import type { DigestSections } from './DigestEmailBuilder';
import { DigestSectionBuilder } from './DigestSectionBuilder';
import { InjectableEmailProviderRegistry } from '../provider/InjectableEmailProviderRegistry';

interface DigestServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

interface DigestServiceDeps {
  configService?: () => Promise<DigestConfigService>;
  providerRegistry?: InjectableEmailProviderRegistry;
  actionDAO?: () => Promise<EmailActionDAO>;
  calendarDAO?: () => Promise<SyncedCalendarEventDAO>;
}

class DigestService {
  private readonly db: D1Queryable;
  private readonly masterKey: string;
  private readonly actionKey: string;
  private readonly actionDAOFactory?: () => Promise<EmailActionDAO>;
  private readonly calendarDAOFactory?: () => Promise<SyncedCalendarEventDAO>;
  private readonly deps: Required<Pick<DigestServiceDeps, 'configService' | 'providerRegistry'>>;

  constructor(
    private readonly env: DigestServiceEnv,
    masterKey: string,
    actionKey: string,
    deps: DigestServiceDeps = {},
  ) {
    this.db = env.DB;
    this.masterKey = masterKey;
    this.actionKey = actionKey;
    const { actionDAO, calendarDAO, ...rest } = deps;
    this.actionDAOFactory = actionDAO;
    this.calendarDAOFactory = calendarDAO;
    this.deps = {
      configService: () => Promise.resolve(new DigestConfigService(new ConnectedApplicationDAO(env.DB, masterKey)),),
      providerRegistry: InjectableEmailProviderRegistry.withDefaults(),
      ...rest,
    };
  }

  public async sendDigest(application: ConnectedApplicationMetadata, accessToken: string): Promise<void> {
    const configSvc = await this.deps.configService();
    const config = await configSvc.getConfig(application.applicationId);
    if (!config.enabled) return;

    await this.buildAndSend(application, accessToken, config.sections, configSvc);
  }

  public async sendDigestForced(application: ConnectedApplicationMetadata, accessToken: string): Promise<void> {
    const configSvc = await this.deps.configService();
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
    if (!DigestEmailBuilder.hasContent(sections, enabledSections)) {
      await configSvc.markSent(application.applicationId);
      return;
    }

    const locale = application.contentLanguage ?? null;
    const subject = DigestEmailBuilder.buildSubject(now, timeZone, locale);
    const htmlBody = DigestEmailBuilder.buildHtml(sections, enabledSections, locale);

    const to = application.providerEmail ?? '';
    if (!to) return;

    await this.sendEmail(application, accessToken, to, subject, htmlBody);
    await configSvc.markSent(application.applicationId);
  }

  private async buildSections(
    applicationId: string,
    enabledSections: string[],
    timeZone: string,
    now: Date,
    nowUnix: number,
  ): Promise<DigestSections> {
    const actionDAO = this.actionDAOFactory
      ? await this.actionDAOFactory()
      : new EmailActionDAO(this.db, this.actionKey);
    const calendarDAO = this.calendarDAOFactory
      ? await this.calendarDAOFactory()
      : new SyncedCalendarEventDAO(this.db);

    const dayStartUnix = DigestSectionBuilder.getDayStartUnix(now, timeZone);
    const dayEndUnix = dayStartUnix + 86_400;

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

    const bills = DigestSectionBuilder.filterBillsDue(allBills, nowUnix);

    const appointments = DigestSectionBuilder.filterUpcomingAppointments(allAppointments, nowUnix);

    return { calendarEvents, tasks, packages, flights, bills, appointments };
  }

  private async sendEmail(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    to: string,
    subject: string,
    htmlBody: string,
  ): Promise<void> {
    // Strict registry resolution: unknown providers throw `Unsupported provider`
    // instead of being masked and falling through to legacy branches.
    const provider = this.deps.providerRegistry.resolve(application.providerId, application.connectionMethod);
    if (provider.sendDigestEmail) {
      await provider.sendDigestEmail(accessToken, to, subject, htmlBody);
      return;
    }
    throw new BadRequestError(`Digest email is not supported for provider: ${application.providerId}`);
  }
}

export { DigestService };
export type { DigestServiceDeps, DigestServiceEnv };
