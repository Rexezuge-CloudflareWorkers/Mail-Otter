import { UserDAO, UserEmailDAO } from '@mail-otter/backend-data/dao';
import type { AccountIdentity } from '../identity/UserIdentityService';

/**
 * The trimmed subset the middleware puts in the request context and the
 * user routes hand to user-scoped DAO calls.
 */
type AccountSummary = AccountIdentity;

interface AccountLookupDeps {
  userDAO: () => Promise<UserDAO>;
  userEmailDAO: () => Promise<UserEmailDAO>;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function summarize(row: { id: string; email: string; current_email?: string | null }): AccountIdentity {
  return { id: row.id, email: normalize(row.current_email ?? row.email), anchorEmail: row.email };
}

/**
 * Address -> account resolution.
 *
 * The registry (`user_emails`) is the only mapping that survives an address
 * change, so it is consulted first; the `users` lookups are the floor for
 * databases that have not run migration 0028, where the address *is* the anchor.
 *
 * Kept as free functions rather than methods on `UserService` so the god-file
 * guard has room there, and so any service that needs an account id can share one
 * implementation instead of re-deriving the query. `UserIdentityService` is the
 * memoized, request-scoped front door to the same rules.
 */
async function resolveAccount(deps: AccountLookupDeps, email: string): Promise<AccountIdentity | null> {
  const normalized: string = normalize(email);
  if (!normalized) return null;
  const userDAO: UserDAO = await deps.userDAO();
  // A known address is authoritative: the registry says which account it belongs
  // to, and a *revoked* row (the account moved off this address) must not resolve
  // at all. Falling through to the legacy lookups in that case would let a
  // reassigned address keep authenticating the previous holder's account.
  try {
    const emailDAO: UserEmailDAO = await deps.userEmailDAO();
    const registered = await emailDAO.get(normalized);
    if (registered) {
      if (registered.is_verified !== 1) return null;
      const byId = await userDAO.getById(registered.user_id);
      return byId?.id ? summarize({ ...byId, id: byId.id }) : null;
    }
  } catch {
    // Registry absent on a database that has not run 0028.
  }
  // No registry row at all. Safe to fall through: migration 0028 backfilled a
  // verified row for every anchor, so a row-less address is either new or on a
  // pre-0028 database, where the address *is* the anchor.
  // `getByCurrentEmail` is 0028-only, so injected fakes may not have it.
  const byCurrent = typeof userDAO.getByCurrentEmail === 'function' ? await userDAO.getByCurrentEmail(normalized).catch(() => null) : null;
  const legacy = byCurrent ?? (await userDAO.getRowByEmail(normalized).catch(() => null));
  return legacy?.id ? summarize({ ...legacy, id: legacy.id }) : null;
}

/**
 * Account id for an address, or null when unknown.
 */
async function resolveUserId(deps: AccountLookupDeps, email: string): Promise<string | null> {
  const account: AccountIdentity | null = await resolveAccount(deps, email);
  return account?.id || null;
}

/**
 * Insert an account and claim its sign-in address.
 *
 * The anchor is the address itself whenever it is free, which keeps every new row
 * shaped like the pre-0028 ones -- and keeps the Vectorize namespace identical to
 * what a pre-0028 deployment would have derived. It falls back to an opaque anchor
 * only when the address is already held as another account's anchor, i.e. its
 * previous holder moved off it, so a released address is never permanently
 * unusable.
 *
 * Returns null when the insert could not produce a resolvable account, which lets
 * the caller retry with a different anchor.
 */
async function registerAccount(deps: AccountLookupDeps, loginEmail: string, anchor: string, now: number): Promise<AccountIdentity | null> {
  const userDAO: UserDAO = await deps.userDAO();
  const id: string = UserDAO.newId();
  // `createUser` stamps the 0028 identity columns; `upsertByEmail` is the pre-0028
  // shape, so injected fakes and legacy call sites still work. Both are no-ops when
  // the anchor is already taken, which is what makes the retry safe.
  if (typeof userDAO.createUser === 'function') {
    await userDAO.createUser({ id, anchor, loginEmail, now });
  } else {
    await userDAO.upsertByEmail(anchor);
  }
  // Claim the sign-in address *before* resolving, otherwise the fresh account is
  // invisible to the registry and registration looks like a failure. An address
  // already verified for another account is left alone by `register`, and the
  // resolve below then reports that other account instead.
  try {
    const emailDAO: UserEmailDAO = await deps.userEmailDAO();
    await emailDAO.register({ email: loginEmail, userId: id, isVerified: true, now });
  } catch {
    // Registry absent (database predating 0028): the anchor is the address.
  }
  return resolveAccount(deps, loginEmail);
}

export { registerAccount, resolveAccount, resolveUserId };
export type { AccountLookupDeps, AccountSummary };

export { type AccountIdentity } from '../identity/UserIdentityService';
