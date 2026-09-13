import { AiDailyUsageDAO, UserDAO } from '@mail-otter/backend-data/dao';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { LocaleUtil } from '@mail-otter/shared/utils';

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
  usageDAO?: () => Promise<AiDailyUsageDAO>;
}

class UserService {
  private readonly deps: Required<UserServiceDeps>;

  constructor(
    private readonly env: UserServiceEnv,
    deps: UserServiceDeps = {},
  ) {
    const db = env.DB;
    this.deps = {
      userDAO: () => Promise.resolve(new UserDAO(db),),
      usageDAO: () => Promise.resolve(new AiDailyUsageDAO(db),),
      ...deps,
    };
  }

  async upsertUser(email: string): Promise<void> {
    const userDAO = await this.deps.userDAO();
    await userDAO.upsertByEmail(email);
  }

  // Single-responsibility read for callers (e.g. CSV export locale) that must
  // not import DAOs directly. Returns null instead of throwing when absent.
  async getPreferredLanguage(userEmail: string): Promise<string | null> {
    try {
      const userDAO = await this.deps.userDAO();
      const user = await userDAO.getByEmail(userEmail);
      return user?.preferredLanguage ? LocaleUtil.normalize(user.preferredLanguage) : null;
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
        const userDAO = await this.deps.userDAO();
        const user = await userDAO.getByEmail(userEmail);
        preferredLanguage = user?.preferredLanguage ? LocaleUtil.normalize(user.preferredLanguage) : null;
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
    const normalized = LocaleUtil.normalize(preferredLanguage);
    const userDAO = await this.deps.userDAO();
    await userDAO.upsertByEmail(userEmail);
    await userDAO.updatePreferredLanguage(userEmail, normalized);
    return normalized;
  }
}

const UserServiceFactory = {
  create(env: UserServiceEnv): UserService {
    return new UserService(env);
  },
};

export { UserService, UserServiceFactory };
export type { CurrentUserSummary, UserServiceDeps, UserServiceEnv };
