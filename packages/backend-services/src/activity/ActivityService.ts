import { ActivityDAO } from '@mail-otter/backend-data/dao';
import type { ActivityEntry, ActivityEntryList, ActivityEventType } from '@mail-otter/shared/model';
import { logTokenAdjacentError } from '@mail-otter/shared/utils';

interface ListActivityInput {
  applicationId?: string;
  cursor?: string;
  limit?: number;
  types?: string[];
}

interface ExportActivityInput {
  applicationId?: string;
  types?: string[];
}

/**
Page size used while draining the feed for an export.
*/
const EXPORT_PAGE_SIZE = 100;

/**
 * Upper bound on pages drained for one export.
 *
 * The interactive feed caps a page at 100 rows, so honouring a request for
 * "everything" means following `nextCursor` repeatedly. This bounds the work so
 * a pathological account cannot hold a Worker invocation open; reaching it is
 * reported rather than silently truncating.
 */
const EXPORT_MAX_PAGES = 100;

const ActivityService = {
  async listActivity(userEmail: string, input: ListActivityInput, env: { DB: D1Database }): Promise<ActivityEntryList> {
    return new ActivityDAO(env.DB).listForUser(userEmail, {
      applicationId: input.applicationId,
      cursor: input.cursor,
      limit: Math.min(input.limit ?? 50, 100),
      types: input.types as ActivityEventType[] | undefined,
    });
  },

  /**
   * Drain the whole activity feed for a CSV export.
   *
   * The export path used to ask for 1000 rows in a single call, which was
   * silently clamped to 100 by `listActivity` and again by the DAO — and since
   * the CSV route never followed `nextCursor`, a user with 500 entries
   * downloaded a 100-row file with no error and no indication of truncation.
   *
   * Paging is explicit here, and hitting `EXPORT_MAX_PAGES` is logged instead
   * of passing off a partial file as complete.
   */
  async exportActivity(
    userEmail: string,
    input: ExportActivityInput,
    env: { DB: D1Database },
  ): Promise<{ entries: ActivityEntry[]; truncated: boolean }> {
    const dao = new ActivityDAO(env.DB);
    const entries: ActivityEntry[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const page: ActivityEntryList = await dao.listForUser(userEmail, {
        applicationId: input.applicationId,
        cursor,
        limit: EXPORT_PAGE_SIZE,
        types: input.types as ActivityEventType[] | undefined,
      });
      entries.push(...page.entries);
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < EXPORT_MAX_PAGES);

    if (cursor) {
      logTokenAdjacentError('warn', 'Activity CSV export hit the page ceiling; the file is incomplete.', {
        user: userEmail,
        pages: String(pages),
      });
    }

    return { entries, truncated: Boolean(cursor) };
  },
};

export { ActivityService };
export type { ExportActivityInput, ListActivityInput };
