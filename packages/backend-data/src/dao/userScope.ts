/**
 * The user-scoping predicate shared by every user-keyed DAO query.
 *
 * Migration 0028 made `users.email` a frozen anchor and added `users.id` as the
 * stable account key. Ownership and user-scoped reads therefore match on the id,
 * with the frozen `user_email` retained as the pre-0028 fallback so a row that
 * was written before the backfill -- or whose address matched no account and so
 * left `user_id` NULL -- stays resolvable and attributable.
 *
 * `id` is nullable on purpose: an unknown caller must still get the address-only
 * predicate rather than a query that can never match.
 */
interface UserScope {
  /**
   * The stable account id, or null when the address is not registered.
   */
  id: string | null;
  /**
   * The frozen anchor (`users.email`), which is what the legacy `*_email`
   * columns actually store. Never the account's current sign-in address: a row
   * written before an address change holds the anchor, so comparing against the
   * current address would miss it.
   */
  anchorEmail: string;
}

interface UserScopeSql {
  /**
   * A SQL boolean fragment to be ANDed into an existing `WHERE`, without the
   * leading `AND`.
   */
  clause: string;
  /**
   * Bindings for the fragment, in the order they appear in `clause`.
   */
  bindings: string[];
}

/**
 * Build the ownership predicate for a user-scoped query.
 *
 * The id branch keeps a NULL-id row visible to the account that owns it by
 * address, which is what preserves "unknown actor stays attributable" across the
 * migration:
 *
 * ```sql
 * WHERE application_id = ? AND (user_id = ? OR (user_id IS NULL AND user_email = ?))
 * ```
 *
 * `alias` qualifies the columns for a query that reaches the user's rows through
 * a join -- `ProcessedMessageDAO.listForUser` and its siblings all filter on
 * `ca.user_email`.
 */
function userScopeSql(scope: UserScope, alias = ''): UserScopeSql {
  const prefix: string = alias ? `${alias}.` : '';
  if (!scope.id) {
    return { clause: `${prefix}user_email = ?`, bindings: [scope.anchorEmail] };
  }
  return {
    clause: `(${prefix}user_id = ? OR (${prefix}user_id IS NULL AND ${prefix}user_email = ?))`,
    bindings: [scope.id, scope.anchorEmail],
  };
}

/**
 * The `SET` fragment for an upsert that dual-writes `user_id`.
 *
 * A caller that cannot resolve an id (a pre-0028 database, or an address
 * matching no account) must not wipe a good id that a previous write stamped, so
 * the upsert keeps the existing value rather than overwriting it with NULL.
 * `table` is required because the bare column name is ambiguous in a `DO UPDATE`
 * clause.
 *
 * ```sql
 * ON CONFLICT(application_id) DO UPDATE SET user_id = COALESCE(excluded.user_id, connected_applications.user_id)
 * ```
 */
function userScopeUpsertSql(table: string): string {
  return 'user_id = COALESCE(excluded.user_id, ' + table + '.user_id)';
}

/**
 * A scope for a caller that only holds a stored anchor and no account id.
 *
 * Used on the row-carried paths (an action row, a connected application) where the
 * address in hand is exactly what the row's `user_email` column holds, so the
 * anchor-only predicate is exact rather than a guess. A row on those paths that
 * *does* have a backfilled `user_id` still matches, through the `IS NULL` branch.
 */
function scopeForAnchor(anchorEmail: string): UserScope {
  return { id: null, anchorEmail };
}

export { scopeForAnchor, userScopeSql, userScopeUpsertSql };
export type { UserScope, UserScopeSql };
