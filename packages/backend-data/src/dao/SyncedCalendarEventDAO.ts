import { UUIDUtil, TimestampUtil } from '@mail-otter/shared/utils';
import { executeD1WithRetry } from '../utils';
import type { SyncedCalendarEvent, SyncedCalendarEventInternal } from '@mail-otter/shared/model';
import { BaseDAO } from './BaseDAO';

class SyncedCalendarEventDAO extends BaseDAO {

  public async upsertEvents(applicationId: string, events: UpsertCalendarEventInput[]): Promise<void> {
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    for (const event of events) {
      await executeD1WithRetry(
        (): Promise<D1Result> =>
          this.database
            .prepare(
              `
                INSERT INTO synced_calendar_events
                  (sync_event_id, application_id, provider_event_id, event_title, start_time, end_time, time_zone, location, notes, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(application_id, provider_event_id)
                DO UPDATE SET event_title = excluded.event_title, start_time = excluded.start_time, end_time = excluded.end_time,
                              time_zone = excluded.time_zone, location = excluded.location, notes = excluded.notes, synced_at = excluded.synced_at
              `,
            )
            .bind(
              UUIDUtil.getRandomUUID(),
              applicationId,
              event.providerEventId,
              event.eventTitle,
              event.startTime,
              event.endTime,
              event.timeZone,
              event.location ?? null,
              event.notes ?? null,
              now,
            )
            .run(),
        'upsert synced calendar event',
      );
    }
  }

  public async listEventsForRange(applicationId: string, startUnix: number, endUnix: number): Promise<SyncedCalendarEvent[]> {
    const rows: SyncedCalendarEventInternal[] = await this.database
      .prepare(
        `
          SELECT sync_event_id, application_id, provider_event_id, event_title, start_time, end_time, time_zone, location, notes, synced_at
          FROM synced_calendar_events
          WHERE application_id = ? AND start_time >= ? AND start_time < ?
          ORDER BY start_time ASC
        `,
      )
      .bind(applicationId, startUnix, endUnix)
      .all<SyncedCalendarEventInternal>()
      .then((result: D1Result<SyncedCalendarEventInternal>): SyncedCalendarEventInternal[] => result.results || []);
    return rows.map(SyncedCalendarEventDAO.toEvent);
  }

  public async pruneOldEvents(beforeUnixSeconds: number, limit: number): Promise<number> {
    const result: D1Result = await executeD1WithRetry(
      (): Promise<D1Result> =>
        this.database
          .prepare(
            `
              DELETE FROM synced_calendar_events
              WHERE sync_event_id IN (
                SELECT sync_event_id FROM synced_calendar_events
                WHERE end_time < ?
                LIMIT ?
              )
            `,
          )
          .bind(beforeUnixSeconds, limit)
          .run(),
      'prune old synced calendar events',
    );
    return (result.meta as { changes?: number } | undefined)?.changes ?? 0;
  }

  private static toEvent(row: SyncedCalendarEventInternal): SyncedCalendarEvent {
    return {
      syncEventId: row.sync_event_id,
      applicationId: row.application_id,
      providerEventId: row.provider_event_id,
      eventTitle: row.event_title,
      startTime: row.start_time,
      endTime: row.end_time,
      timeZone: row.time_zone,
      location: row.location,
      notes: row.notes,
      syncedAt: row.synced_at,
    };
  }
}

interface UpsertCalendarEventInput {
  providerEventId: string;
  eventTitle: string;
  startTime: number;
  endTime: number;
  timeZone: string;
  location?: string | null;
  notes?: string | null;
}

export { SyncedCalendarEventDAO };
export type { UpsertCalendarEventInput };
