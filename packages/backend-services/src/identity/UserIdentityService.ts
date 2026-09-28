import { UserDAO, UserEmailDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError, DatabaseError } from '@mail-otter/backend-errors';
import { TimestampUtil } from '@mail-otter/shared/utils';

interface UserIdentityEnv {
  DB: D1Queryable;
}

interface UserIdentityDeps {
  userDAO?: () => Promise<UserDAO>;
  userEmailDAO?: () => Promise<UserEmailDAO>;
}

/**
 * A resolved account.
 *
 * `id` is the only thing that should be used as an identity. `email` is the
 * address the account currently signs in with, and `anchorEmail` is the frozen
 * internal value that legacy `*_email` columns and their foreign keys point at
 * -- and the input to the Vectorize namespace.
 *
 * Structurally satisfies `UserScope`, so a route can hand the whole identity to
 * a user-scoped DAO query.
 */
interface AccountIdentity {
  id: string;
  email: string;
  anchorEmail: string;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function wrap(error: unknown, message: string): DatabaseError {
  if (error instanceof DatabaseError) return error;
  return new DatabaseError(`${message}: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * The account behind an address.
 *
 * Resolution is address -> `user_emails` -> `users.id`, so an account keeps
 * working after it changes its address: the new address resolves through the
 * registry to the same id that every mailbox, context document, and action
 * points at.
 *
 * Results are memoized for the lifetime of the instance, which is one request
 * scope -- a request that authorizes against several applications resolves the
 * same viewer once.
 */
class UserIdentityService {
  private readonly deps: Required<UserIdentityDeps>;
  private readonly byEmail = new Map<string, AccountIdentity | null>();

  constructor(
    private readonly env: UserIdentityEnv,
    deps: UserIdentityDeps = {},
  ) {
    this.deps = {
      userDAO: () => Promise.resolve(new UserDAO(env.DB)),
      userEmailDAO: () => Promise.resolve(new UserEmailDAO(env.DB)),
      ...deps,
    };
  }

  /**
   * Resolve a sign-in address to its account, or null when unknown.
   *
   * Only a verified address resolves. A revoked address (changed away from) is
   * retained for attribution but must never authenticate, otherwise a
   * reassigned company address would inherit the previous holder's account.
   */
  public async resolveAccount(email: string): Promise<AccountIdentity | null> {
    const key: string = normalize(email);
    if (!key) return null;
    const cached: AccountIdentity | null | undefined = this.byEmail.get(key);
    if (cached !== undefined) return cached;
    const resolved: AccountIdentity | null = await this.load(key);
    this.byEmail.set(key, resolved);
    return resolved;
  }

  /**
   * Account id for a sign-in address, or null when unknown.
   */
  public async resolveUserId(email: string): Promise<string | null> {
    const account: AccountIdentity | null = await this.resolveAccount(email);
    return account?.id ?? null;
  }

  /**
   * Account behind an id. The inverse direction, for a caller that already holds
   * a stable key and needs the address the account currently signs in with.
   */
  public async resolveUserById(userId: string): Promise<AccountIdentity | null> {
    try {
      const dao: UserDAO = await this.deps.userDAO();
      const row = await dao.getById(userId);
      return row?.id ? { id: row.id, email: normalize(row.current_email ?? row.email), anchorEmail: row.email } : null;
    } catch (error: unknown) {
      throw wrap(error, 'Failed to resolve account');
    }
  }

  private async load(email: string): Promise<AccountIdentity | null> {
    let emailDAO: UserEmailDAO;
    let userDAO: UserDAO;
    try {
      [emailDAO, userDAO] = await Promise.all([this.deps.userEmailDAO(), this.deps.userDAO()]);
    } catch (error: unknown) {
      throw wrap(error, 'Failed to load identity');
    }
    // A known address is authoritative, and a *revoked* one must not resolve:
    // falling through to a `users` lookup would let a reassigned address keep
    // authenticating the previous holder's account.
    const registered = await emailDAO.get(email).catch(() => null);
    if (registered) {
      if (registered.is_verified !== 1) return null;
      const row = await userDAO.getById(registered.user_id).catch(() => null);
      return row?.id ? { id: row.id, email: normalize(row.current_email ?? row.email), anchorEmail: row.email } : null;
    }
    // No registry row. Migration 0028 backfilled a verified row for every
    // anchor, so a row-less address is either brand new or on a pre-0028
    // database where the address is the anchor; both are covered by the `users`
    // lookups. A *revoked* address always has a row and returned above.
    // `getByCurrentEmail` is 0028-only, so an injected fake may not have it.
    const byCurrent = typeof userDAO.getByCurrentEmail === 'function' ? await userDAO.getByCurrentEmail(email).catch(() => null) : null;
    const legacy = byCurrent ?? (await userDAO.getRowByEmail(email).catch(() => null));
    return legacy?.id ? { id: legacy.id, email: normalize(legacy.current_email ?? legacy.email), anchorEmail: legacy.email } : null;
  }

  /**
   * Every address known for an account, verified ones first.
   */
  public async listAddresses(userId: string): Promise<Array<{ email: string; isVerified: boolean }>> {
    const dao: UserEmailDAO = await this.deps.userEmailDAO();
    const rows = await dao.listByUserId(userId);
    return rows.map((row): { email: string; isVerified: boolean } => ({ email: row.email, isVerified: row.is_verified === 1 }));
  }

  /**
   * Point an account at a new sign-in address.
   *
   * The account id, the frozen anchor, and every id-keyed row are untouched:
   * only which address authenticates the account moves. The previous address is
   * revoked rather than deleted, so rows written before the change still resolve
   * to this account, and it is released for a later legitimate holder.
   *
   * Rejects an address already verified for another account. That check is the
   * whole reason this is not simply an `UPDATE`: Cloudflare Access is the only
   * authenticator, so an unverified self-service change would let anyone claim an
   * address and inherit its account.
   *
   * No route exposes this. Proof of control for the new address (a confirm step
   * performed while authenticated as that address) has to land first; until then
   * an administrator runs `scripts/change-email.ts`.
   */
  public async setPrimaryEmail(
    userId: string,
    newEmail: string,
    now: number = TimestampUtil.getCurrentUnixTimestampInSeconds(),
  ): Promise<AccountIdentity> {
    const email: string = normalize(newEmail);
    if (!email) throw new BadRequestError('Invalid email address');
    const userDAO: UserDAO = await this.deps.userDAO();
    const emailDAO: UserEmailDAO = await this.deps.userEmailDAO();
    const row = await userDAO.getById(userId);
    if (!row?.id) throw new BadRequestError('User not found');
    const current: string = normalize(row.current_email ?? row.email);
    if (current === email) {
      return { id: row.id, email, anchorEmail: row.email };
    }
    const holder = await emailDAO.resolveVerified(email);
    if (holder && holder.user_id !== row.id) throw new BadRequestError('Email is already in use');
    await emailDAO.register({ email, userId: row.id, isVerified: true, now });
    // Revoke every other verified address, so only the new one authenticates.
    await emailDAO.revokeAllVerified(row.id, email);
    await userDAO.setCurrentEmail(row.id, email, now);
    this.byEmail.delete(current);
    const identity: AccountIdentity = { id: row.id, email, anchorEmail: row.email };
    this.byEmail.set(email, identity);
    return identity;
  }

  /**
   * Ops/migration path: attach an address that has already been proven, without
   * making it the sign-in address.
   */
  public async linkVerifiedEmail(
    userId: string,
    email: string,
    now: number = TimestampUtil.getCurrentUnixTimestampInSeconds(),
  ): Promise<void> {
    const address: string = normalize(email);
    if (!address) throw new BadRequestError('Invalid email address');
    const dao: UserEmailDAO = await this.deps.userEmailDAO();
    const outcome = await dao.register({ email: address, userId, isVerified: true, now });
    if (outcome === 'already-claimed') throw new BadRequestError('Email is already in use');
  }
}

export { UserIdentityService };
export type { AccountIdentity, UserIdentityDeps, UserIdentityEnv };
