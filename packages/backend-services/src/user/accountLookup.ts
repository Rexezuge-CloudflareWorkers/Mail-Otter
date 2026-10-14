/**
 * Account resolution, re-exported from the kit.
 *
 * These were free functions here too, converged verbatim from
 * `backend-services/src/user/accountLookup.ts` — the split exists so `UserService`
 * stays under the god-file guard while other services share one implementation.
 * `@rexezuge/identity` owns them, and this file is the seam that keeps the
 * `@mail-otter/backend-services/user/accountLookup` import path working for the
 * callers that use it.
 *
 * Two fixes come with the move, and both are the reason it is worth making:
 *
 * **The load path no longer swallows every error.** The local copy caught
 * `catch {}` around each DAO read, so a D1 blip on `user_emails.get` looked
 * exactly like "no such row" and resolution fell through to the anchor — which
 * can resolve a *revoked* address against the account that held it previously.
 * The kit narrows the catch to `isMissingSchemaError`, so a database that has
 * not run 0028 still degrades to the anchor and a transient failure does not.
 *
 * **Registration reads back before trusting its write.** `createUser` is
 * `ON CONFLICT DO NOTHING`, so a taken anchor makes the insert a silent no-op and
 * the generated id belongs to nobody; the read-back requiring *our* id to be the
 * one there is what makes that detectable, so the opaque-anchor retry gets a
 * genuinely new account instead of pointing the registry at a phantom one.
 *
 * `UserDAO` here is the local subclass (it keeps `preferred_language` and the
 * legacy-row adoption clause); `UserEmailDAO` is the kit's.
 */
export { registerAccount, resolveAccount, resolveUserId } from '@rexezuge/identity';
export type { AccountLookupDeps } from '@rexezuge/identity';

export { type AccountIdentity } from '../identity/UserIdentityService';
