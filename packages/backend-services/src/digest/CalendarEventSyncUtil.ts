import { SyncedCalendarEventDAO } from '@mail-otter/backend-data/dao';
import type { UpsertCalendarEventInput } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplicationMetadata } from '@mail-otter/shared/model';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { InjectableEmailProviderRegistry } from '../provider/InjectableEmailProviderRegistry';

class CalendarEventSyncUtil {
  private readonly eventDAO: SyncedCalendarEventDAO;

  constructor(
    db: D1Queryable,
    private readonly providerRegistry: InjectableEmailProviderRegistry = InjectableEmailProviderRegistry.withDefaults(),
  ) {
    this.eventDAO = new SyncedCalendarEventDAO(db);
  }

  public async syncForApplication(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<void> {
    const events = await this.fetchProviderEvents(application, accessToken, windowStartIso, windowEndIso);
    if (events.length > 0) {
      await this.eventDAO.upsertEvents(application.applicationId, events);
    }
  }

  private async fetchProviderEvents(
    application: ConnectedApplicationMetadata,
    accessToken: string,
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<UpsertCalendarEventInput[]> {
    // Strict registry resolution: unknown providers throw `Unsupported provider`
    // instead of being masked and falling through to legacy branches.
    const provider = this.providerRegistry.resolve(application.providerId, application.connectionMethod);
    if (provider.listCalendarEvents) {
      return provider.listCalendarEvents(accessToken, windowStartIso, windowEndIso);
    }

    throw new BadRequestError(`Calendar sync is not supported for provider: ${application.providerId}`);
  }
}

export { CalendarEventSyncUtil };
