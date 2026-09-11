# Mail-Otter — Scheduled Digest

Scope: `packages/backend-services/src/digest/**`. Parent index: `../../../AGENTS.md`.

Optional daily digest per application (`DigestConfig` in `packages/shared/src/model/DigestConfig.ts`). Managed via `GET|PUT /user/application/digest`; `POST /user/application/digest/send` sends immediately. Configurable sections (`DIGEST_ALL_SECTIONS`): `calendar`, `tasks`, `packages`, `flights`, `bills`, `appointments`.

`ScheduledDigestTask` (Phase 2). Logic in `packages/backend-services/src/digest/` (`DigestConfigService`, `DigestEmailUtil`, `DigestService`). `CalendarEventSyncTask` / `ActionStatusSyncTask` (Phase 1) keep data fresh. Digest config lives in provider-config rows (`digest_enabled`, `digest_send_time`, `digest_sections`, `digest_last_sent_at`); `SyncedCalendarEventDAO` holds synced events and `BackgroundTaskRunDAO` holds cron run history.
