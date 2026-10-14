/**
 * The address registry is the kit's.
 *
 * `users.email` is the frozen anchor; `user_emails` is the set of addresses an
 * account has claimed, keyed on the lowercased form so a legacy mixed-case anchor
 * still resolves to exactly one identity. A row is re-pointed rather than deleted
 * when a later account legitimately claims the address, so an address is never
 * permanently reserved by whoever held it first.
 *
 * This file was a byte-for-byte copy of the kit's and is now a re-export: six
 * methods, identical SQL, identical semantics. The only difference was the
 * `withRetry`/`allWithRetry` call names, which the sql-first `BaseDAO` renamed.
 */
export { UserEmailDAO } from '@rexezuge/identity';
export type { EmailClaim, UserEmailRow } from '@rexezuge/identity';
