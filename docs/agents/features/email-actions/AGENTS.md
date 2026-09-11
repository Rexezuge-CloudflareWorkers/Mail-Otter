# Mail-Otter — Email Actions And Calendar

Scope: `packages/backend-services/src/action/**`, action types in `packages/shared/src/constants/Providers.ts`. Parent index: `../../../AGENTS.md`.

- Action types: `calendar.add_event`, `email.draft_reply`, `external.open_link`, `manual.todo`, `delivery.track_package`, `travel.track_flight`, `finance.pay_bill`, `appointment.confirm`. Each has typed payload (`EmailActionPayload`), risk level (`low`/`medium`/`high`), status (`pending`/`executing`/`succeeded`/`failed`/`expired`/`cancelled`), and trigger (`email_callback`, `web_ui`, `system_expiry`, `auto_execute`, `scheduled`).
- Auto-execution is restricted to `calendar.add_event` + `email.draft_reply` (`AUTO_EXECUTABLE_ACTION_TYPES`); snooze/schedule capped at 30 days with expiry buffers (`ActionSchedulingService`, `ScheduledActionExecutionTask`).
- `delivery.track_package` → `PackageTrackingService` (Aftership, `PACKAGE_TRACKING_API_KEY`); `travel.track_flight` → `FlightTrackingService` (Aviationstack, `FLIGHT_TRACKING_API_KEY`). Empty key = feature disabled.
- Action callbacks encrypted with `ACTION_ENCRYPTION_KEY_SECRET`, signed with `ACTION_SIGNING_SECRET`.
- `calendar.add_event` requires optional `calendar` feature (`enabledFeatures`), adds OAuth scopes (Gmail `https://www.googleapis.com/auth/calendar.events` / Outlook `https://graph.microsoft.com/Calendars.ReadWrite` / Fastmail `urn:ietf:params:jmap:calendars` — see `OAUTH2_FEATURE_SCOPES`) — triggers re-auth.
- Calendar dates use per-mailbox time zone (`calendar_time_zone` provider-config row, via `TimeZoneUtil`, default `UTC`). Never assume UTC.
