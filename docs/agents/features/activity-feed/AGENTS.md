# Mail-Otter — Activity Feed

Scope: `packages/backend-data/src/dao/ActivityDAO.ts`, `apps/api/src/endpoints/user/activity/`. Parent index: `../../../AGENTS.md`.

`GET /user/activity` — reverse-chronological `ActivityEntry` list from three D1 tables (no migration required).

**Data sources**: `processed_messages` → `email_processed`; `email_summary_actions` → `action_created`; `email_action_executions` JOIN `email_summary_actions` → `action_executed`.

**Query strategy**: `ActivityDAO.listForUser` runs up to 3 parallel queries (one per type, skipped if filtered out), merges + sorts DESC by timestamp, slices to `limit`. Cursor = `CursorUtil.encode({ beforeTs })`.

**Params**: `applicationId`, `types[]` (`email_processed`/`action_created`/`action_executed`), `cursor`, `limit` (default 50, max 100), `format=csv` (1000 entries, ignores cursor/limit).

**CSV columns**: Event Type, Application ID, Timestamp ISO, Provider Message ID, Status / Execution Status, Error Message, Action ID, Action Type, Risk Level, Triggered By.

**Frontend**: `ActivityView`, `useActivity` hook, `activityService.ts` — mailbox selector, event-type checkboxes, Export CSV, Refresh, Load More.
