interface DigestConfig {
  enabled: boolean;
  sendTime: string;
  sections: string[];
  lastSentAt: string | null;
}

interface SyncedCalendarEvent {
  syncEventId: string;
  applicationId: string;
  providerEventId: string;
  eventTitle: string;
  startTime: number;
  endTime: number;
  timeZone: string;
  location?: string | null;
  notes?: string | null;
  syncedAt: number;
}

interface SyncedCalendarEventInternal {
  sync_event_id: string;
  application_id: string;
  provider_event_id: string;
  event_title: string;
  start_time: number;
  end_time: number;
  time_zone: string;
  location: string | null;
  notes: string | null;
  synced_at: number;
}

interface SyncedCalendarEventList {
  events: SyncedCalendarEvent[];
  nextCursor?: string;
}

export type { DigestConfig, SyncedCalendarEvent, SyncedCalendarEventInternal, SyncedCalendarEventList };
