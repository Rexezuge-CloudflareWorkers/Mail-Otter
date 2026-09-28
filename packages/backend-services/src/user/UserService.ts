import { AiDailyUsageDAO, UserDAO, UserEmailDAO } from '@mail-otter/backend-data/dao';
import type { UserRow } from '@mail-otter/backend-data/dao';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { LocaleUtil, TimestampUtil } from '@mail-otter/shared/utils';
import type { AccountIdentity, UserIdentityService } from '../identity/UserIdentityService';
import { registerAccount, resolveAccount, resolveUserId } from './accountLookup';
import type { AccountLookupDeps } from './accountLookup';

interface UserServiceEnv {
  DB: D1Database;
  MAX_APPLICATIONS_PER_USER?: string;
  MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string;
  AI_DAILY_NEURON_FREE_TIER_LIMIT?: string;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
}

interface CurrentUserSummary {
  preferredLanguage: string | null;
  limits: {
    maxApplicationsPerUser: number;
    maxContextDocumentsPerApplication: number;
  };
  aiUsage: {
    estimatedNeurons: number;
    dailyNeuronLimit: number;
    fallbackThreshold: number;
  };
}

interface UserServiceDeps {
  userDAO?: () => Promise<UserDAO>;
  userEmailDAO?: () => Promise<UserEmailDAO>;
  usageDAO?: () => Promise<AiDailyUsageDAO>;
  /**
   * Shared per-request identity resolver.
   *
   * `upsertUser` deliberately does *not* use it: it is the bootstrap path and has to
   * resolve without depending on a service built from the same lookups. Everything
   * that only needs an address -> id mapping goes through this instance, so a
   * request that authorizes against several applications resolves the caller once.
   */
  userIdentity?: () => Promise<UserIdentityService>;
}

class UserService {
  private readonly deps: Required<Omit<UserServiceDeps, 'userIdentity'>>;
  /**
   * The shared per-request identity resolver, when the composition root supplied
   * one. Held separately rather than defaulted, because it genuinely has no
   * standalone equivalent: the constructor has no composition root to ask, and
   * `resolveUserId` falls back to the free functions, which implement the same
   * rules. A rejecting default here would only be a trap to read.
   */
  private readonly sharedIdentity: (() => Promise<UserIdentityService>) | undefined;

  constructor(
    private readonly env: UserServiceEnv,
    deps: UserServiceDeps = {},
  ) {
    const db = env.DB;
    this.sharedIdentity = deps.userIdentity;
    this.deps = {
      userDAO: deps.userDAO ?? ((): Promise<UserDAO> => Promise.resolve(new UserDAO(db))),
      userEmailDAO: deps.userEmailDAO ?? ((): Promise<UserEmailDAO> => Promise.resolve(new UserEmailDAO(db))),
      usageDAO: deps.usageDAO ?? ((): Promise<AiDailyUsageDAO> => Promise.resolve(new AiDailyUsageDAO(db))),
    };
  }

  /**
   * Resolve an authenticated address to its account, creating the account if this
   * is the first time it is seen.
   *
   * Resolve-then-create rather than an unconditional upsert: `users.email` is a
   * frozen anchor, so an unconditional insert on the *current* address would mint
   * a second account the moment a user changed their address, orphaning every
   * id-keyed row behind the original. This is the single call that guarantees an
   * address can never fork a second identity.
   *
   * Returns the account even when resolution fails, so a partially-migrated
   * database still authenticates by address rather than 500ing the whole request.
   */
  async upsertUser(email: string): Promise<AccountIdentity> {
    const normalized: string = email.trim().toLowerCase();
    const now: number = TimestampUtil.getCurrentUnixTimestampInSeconds();
    let account: AccountIdentity | null = await resolveAccount(this.lookupDeps(), normalized);
    if (!account) {
      // Prefer the address as the frozen anchor, which keeps a new row shaped like
      // the pre-0028 ones (and keeps its Vectorize namespace identical to what a
      // pre-0028 deployment derived). Retry with an opaque anchor only when the
      // address is already held as another account's anchor.
      account = await registerAccount(this.lookupDeps(), normalized, normalized, now);
      if (!account) account = await registerAccount(this.lookupDeps(), normalized, UserDAO.newAnchor(), now);
    }
    return account ?? { id: '', email: normalized, anchorEmail: normalized };
  }

  /**
   * Account id for a sign-in address, or null when the address is not registered.
   *
   * Write paths use this to stamp `user_id` alongside the frozen address column, so
   * a row keeps belonging to the account after the account changes address. Goes
   * through the shared per-request resolver when one is injected.
   */
  async resolveUserId(email: string): Promise<string | null> {
    if (this.sharedIdentity) {
      const identity: UserIdentityService = await this.sharedIdentity();
      return identity.resolveUserId(email);
    }
    return resolveUserId(this.lookupDeps(), email);
  }

  private lookupDeps(): AccountLookupDeps {
    return { userDAO: this.deps.userDAO, userEmailDAO: this.deps.userEmailDAO };
  }

  // Single-responsibility read for callers (e.g. CSV export locale) that must
  // not import DAOs directly. Returns null instead of throwing when absent.
  async getPreferredLanguage(userEmail: string): Promise<string | null> {
    try {
      const row = await this.loadUserRow(userEmail);
      return row?.preferred_language ? LocaleUtil.normalize(row.preferred_language) : null;
    } catch {
      return null;
    }
  }

  async getCurrentUserSummary(userEmail?: string): Promise<CurrentUserSummary> {
    const today = new Date().toISOString().slice(0, 10);
    const usageDAO = await this.deps.usageDAO();
    const usage = await usageDAO.getByDate(today);
    let preferredLanguage: string | null = null;
    if (userEmail) {
      try {
        const row = await this.loadUserRow(userEmail);
        preferredLanguage = row?.preferred_language ? LocaleUtil.normalize(row.preferred_language) : null;
      } catch {
        preferredLanguage = null;
      }
    }
    return {
      preferredLanguage,
      limits: {
        maxApplicationsPerUser: ConfigurationManager.getMaxApplicationsPerUser(this.env),
        maxContextDocumentsPerApplication: ConfigurationManager.getMaxContextDocumentsPerApplication(this.env),
      },
      aiUsage: {
        estimatedNeurons: usage?.estimatedNeurons ?? 0,
        dailyNeuronLimit: ConfigurationManager.getAiDailyNeuronFreeTierLimit(this.env),
        fallbackThreshold: ConfigurationManager.getAiDailyNeuronFallbackThreshold(this.env),
      },
    };
  }

  async updatePreferredLanguage(userEmail: string, preferredLanguage: string): Promise<string> {
    const normalized: string = LocaleUtil.normalize(preferredLanguage);
    const userDAO: UserDAO = await this.deps.userDAO();
    // Resolve-then-create, so this works for a user who is not in the table yet and
    // cannot fork a second account for an address that already belongs to one.
    const account: AccountIdentity = await this.upsertUser(userEmail);
    // The anchor is the stable write key: it is the PRIMARY KEY of `users` and the
    // only column a pre-0028 database has, so the update stays valid either way.
    await userDAO.updatePreferredLanguage(account.anchorEmail || account.email, normalized);
    return normalized;
  }

  /**
   * Read the `users` row behind a sign-in address.
   *
   * Resolves through the identity layer first so a user who has changed address is
   * still found, then falls back to the anchor lookup. Returns null rather than
   * throwing when the address is unknown, so callers that treat a missing profile
   * as "no preference set" keep working.
   */
  private async loadUserRow(email: string): Promise<UserRow | null> {
    const account: AccountIdentity | null = await resolveAccount(this.lookupDeps(), email);
    const userDAO: UserDAO = await this.deps.userDAO();
    if (!account) return userDAO.getRowByEmail(email).catch(() => null);
    if (account.id) {
      const byId: UserRow | null = await userDAO.getById(account.id).catch(() => null);
      if (byId) return byId;
    }
    return userDAO.getRowByEmail(account.anchorEmail).catch(() => null);
  }
}

const UserServiceFactory = {
  create(env: UserServiceEnv): UserService {
    return new UserService(env);
  },
};

export { UserService, UserServiceFactory };
export type { CurrentUserSummary, UserServiceDeps, UserServiceEnv };
