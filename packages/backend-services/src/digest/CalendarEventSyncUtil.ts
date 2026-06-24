import { SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import type { UpsertCalendarEventInput } from '@mail-otter/backend-data/dao';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import type { ConnectedApplicationMetadata } from '@mail-otter/shared/model';
import type { D1Queryable } from '@mail-otter/backend-data/utils';

class CalendarEventSyncUtil {
  private readonly eventDAO: SyncedCalendarEventDAO;

  constructor(db: D1Queryable) {
    this.eventDAO = new SyncedCalendarEventDAO(db);
  }

  public async syncForApplication(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<void> {
    const events = await CalendarEventSyncUtil.fetchProviderEvents(application, accessToken, windowStartIso, windowEndIso);
    if (events.length > 0) {
      await this.eventDAO.upsertEvents(application.applicationId, events);
    }
  }

  private static async fetchProviderEvents(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<UpsertCalendarEventInput[]> {
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      const items = await GmailProviderUtil.listCalendarEventsByDateRange(accessToken, windowStartIso, windowEndIso);
      return items
        .filter((item) => item.start?.dateTime)
        .map((item) => ({
          providerEventId: item.id,
          eventTitle: item.summary || '(no title)',
          startTime: Math.floor(new Date(item.start!.dateTime!).getTime() / 1000),
          endTime: item.end?.dateTime ? Math.floor(new Date(item.end.dateTime).getTime() / 1000) : Math.floor(new Date(item.start!.dateTime!).getTime() / 1000) + 3600,
          timeZone: item.start?.timeZone || 'UTC',
          location: item.location || null,
          notes: item.description || null,
        }));
    }

    if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      const items = await OutlookProviderUtil.listCalendarEventsByDateRange(accessToken, windowStartIso, windowEndIso);
      return items
        .filter((item) => item.start?.dateTime)
        .map((item) => ({
          providerEventId: item.id,
          eventTitle: item.subject || '(no title)',
          startTime: Math.floor(new Date(item.start!.dateTime!).getTime() / 1000),
          endTime: item.end?.dateTime ? Math.floor(new Date(item.end.dateTime).getTime() / 1000) : Math.floor(new Date(item.start!.dateTime!).getTime() / 1000) + 3600,
          timeZone: item.start?.timeZone || 'UTC',
          location: item.location?.displayName || null,
          notes: null,
        }));
    }

    return [];
  }
}

export { CalendarEventSyncUtil };
