import { DIGEST_CALENDAR_SYNC_DAYS } from '../constants';
import { TimeZoneUtil } from './TimeZoneUtil';

const MILLISECONDS_PER_DAY = 86_400_000;

interface CalendarSyncWindow {
  startIso: string;
  endIso: string;
}

/**
 * The calendar range a sync should fetch.
 *
 * Two call sites previously computed this independently and disagreed:
 * `CalendarEventSyncTask` used `DIGEST_CALENDAR_SYNC_DAYS` (7) while the manual
 * `ProcessingService.triggerTask` path hardcoded `48 * 3600 * 1000`, so
 * `POST /user/processing/run-task` with `calendar_sync` only ever upserted two
 * days of events. `SyncedCalendarEventDAO.upsertEvents` only upserts and never
 * deletes, so the stored set shrank in coverage until the next cron run.
 *
 * Both also started the window at `now`, but the digest's calendar section
 * covers `[local midnight, +24h)`. Nothing ever queried the hours between
 * local midnight and the first sync of the day, so a morning event created
 * after the previous evening's sync — including every event on a newly
 * connected mailbox — was missing from that day's digest. Anchoring to the
 * start of the current local day closes that gap.
 */
const CalendarSyncWindow = {
  build(now: Date, timeZone: string | null | undefined): CalendarSyncWindow {
    const dayStartSeconds: number = TimeZoneUtil.getLocalDayStartUnixSeconds(now, timeZone);
    const startMs = dayStartSeconds * 1000;
    return {
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(startMs + DIGEST_CALENDAR_SYNC_DAYS * MILLISECONDS_PER_DAY).toISOString(),
    };
  },
};

export { CalendarSyncWindow };
export type { CalendarSyncWindow as CalendarSyncWindowType };
