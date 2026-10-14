import { UserIdentityService as KitUserIdentityService } from '@rexezuge/identity';
import type { ResolvedAccount, UserIdentityDeps, UserIdentityEnv } from '@rexezuge/identity';
import { UserDAO } from '@mail-otter/backend-data/dao';
import { UserEmailDAO } from '@mail-otter/backend-data/dao';

/**
 * A resolved account.
 *
 * `id` is the only thing that should be used as an identity. `email` is the
 * address the account currently signs in with, and `anchorEmail` is the frozen
 * internal value that legacy `*_email` columns and their foreign keys point at —
 * and the input to the Vectorize namespace.
 *
 * Structurally satisfies `UserScope`, so a route can hand the whole identity to a
 * user-scoped DAO query. It is the kit's `ResolvedAccount` minus the one field
 * this repo does not use: `username` arrived with migration 0029 and has no
 * caller yet, so it is dropped rather than threaded through every route for a
 * value nobody reads.
 */
interface AccountIdentity {
  id: string;
  email: string;
  anchorEmail: string;
}

/**
 * The account behind an address, plus the address-change operations.
 *
 * The service is the kit's, with the DAO factories pointed at this repo's DAOs:
 * `UserDAO` is the local subclass (it keeps `preferred_language` and the
 * legacy-row adoption clause that `createUser` needs on a database predating
 * migration 0028), and `UserEmailDAO` is the kit's.
 *
 * One instance per request scope. The ownership and permission paths resolve the
 * same caller several times each, so the per-instance address memo costs one
 * query per request rather than one per comparison — constructing one per
 * consumer is the bug the memo exists to prevent.
 *
 * Three fixes come with the kit's implementation, and each is a real behaviour
 * difference rather than a rename:
 *
 * **The load path no longer swallows every error.** The local copy caught
 * `catch {}` around each DAO read, so a D1 blip on `user_emails.get` was
 * indistinguishable from "no such row" and resolution fell through to the anchor
 * — which can resolve a *revoked* address against the account that previously
 * held it. The kit narrows the catch to `isMissingSchemaError`, so a database
 * that has not run 0028 still degrades to the anchor and a transient failure
 * does not.
 *
 * **`setPrimaryEmail` moves the address before revoking the old one.** The local
 * order revoked first, so a failure between the two left the account with no
 * verified address at all — locked out of its own mailboxes. The kit's order
 * means a partial failure leaves the new address working.
 *
 * **Email format is validated before the write**, rather than only on the way in
 * from a route, so a caller reaching this directly cannot register a malformed
 * address into the registry.
 */
class UserIdentityService extends KitUserIdentityService {
  constructor(env: UserIdentityEnv, deps: UserIdentityDeps = {}) {
    super(env, {
      userDAO: (): Promise<UserDAO> => Promise.resolve(new UserDAO(env.DB)),
      userEmailDAO: (): Promise<UserEmailDAO> => Promise.resolve(new UserEmailDAO(env.DB)),
      ...deps,
    });
  }
}

/**
 * Narrow the kit's `ResolvedAccount` to the shape the rest of this repo passes
 * around.
 *
 * `username` is dropped rather than threaded: it landed with migration 0029 and
 * no caller reads it yet, so carrying it through every route, DAO call and test
 * fixture would be churn in exchange for a field nothing consumes.
 */
function toAccountIdentity(account: ResolvedAccount | null): AccountIdentity | null {
  return account ? { id: account.id, email: account.email, anchorEmail: account.anchorEmail } : null;
}

export { toAccountIdentity, UserIdentityService };
export type { AccountIdentity };

export { type D1Queryable } from '@rexezuge/d1';
export { type UserIdentityDeps, type UserIdentityEnv } from '@rexezuge/identity';
