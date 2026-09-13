import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_IMAP_PASSWORD,
  CONNECTION_METHOD_OAUTH2,
  OAUTH2_FEATURE_SCOPES,
} from '@mail-otter/shared/constants';
import {
  AiDailyUsageDAO,
  ApplicationContextDAO,
  ApplicationIntegrationDAO,
  ConnectedApplicationDAO,
  IntegrationDeliveryLogDAO,
  OAuth2AccessTokenCacheDAO,
} from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
import { isImapPasswordApplication } from '@mail-otter/shared/model';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
  EmailProcessingRule,
  IntegrationDeliveryLog,
  OAuth2Credentials,
  OutboundIntegration,
  OutboundIntegrationType,
  SenderDomainFilters,
} from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { EmailContextUtil } from '../email/EmailContextUtil';
import { EmailRuleSuggestionUtil } from '../email/EmailRuleSuggestionUtil';
import { AiUsageUtil } from '../email/AiUsageUtil';
import type { AiTextGenerationUsage } from '../email/WorkersAiResponseUtil';
import { IntegrationService } from '../integration/IntegrationService';
import { WatchService } from '../subscription/WatchService';
import type { WatchServiceEnv } from '../subscription/WatchService';
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import { OAuth2AccessTokenService } from '../oauth2/OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from '../oauth2/OAuth2AccessTokenService';
import { ApplicationResponseUtil } from './ApplicationResponseUtil';
import type { ApplicationResponse } from './ApplicationResponseUtil';

interface ApplicationServiceDeps {
  applicationDAO?: () => Promise<ConnectedApplicationDAO>;
  contextDAO?: () => Promise<ApplicationContextDAO>;
  integrationDAO?: () => Promise<ApplicationIntegrationDAO>;
  deliveryLogDAO?: () => Promise<IntegrationDeliveryLogDAO>;
  usageDAO?: () => Promise<AiDailyUsageDAO>;
  tokenCacheDAO?: () => Promise<OAuth2AccessTokenCacheDAO>;
  watchService?: () => Promise<WatchService>;
  integrationService?: () => Promise<IntegrationService>;
  tokenService?: () => Promise<OAuth2AccessTokenService>;
}

class ApplicationService {
  private readonly deps: Required<ApplicationServiceDeps>;

  constructor(
    private readonly env: ApplicationServiceEnv,
    deps: ApplicationServiceDeps = {},
  ) {
    const db = env.DB;
    const masterKey = (): Promise<string> => env.AES_ENCRYPTION_KEY_SECRET.get();
    this.deps = {
      applicationDAO: async () => new ConnectedApplicationDAO(db, await masterKey()),
      contextDAO: () => Promise.resolve(new ApplicationContextDAO(db),),
      integrationDAO: async () => new ApplicationIntegrationDAO(db, await masterKey()),
      deliveryLogDAO: () => Promise.resolve(new IntegrationDeliveryLogDAO(db),),
      usageDAO: () => Promise.resolve(new AiDailyUsageDAO(db),),
      tokenCacheDAO: async () => new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE as KVNamespace, await masterKey()),
      watchService: () => Promise.resolve(new WatchService(env as WatchServiceEnv),),
      integrationService: () => Promise.resolve(new IntegrationService(env),),
      tokenService: () => Promise.resolve(new OAuth2AccessTokenService(env as OAuth2AccessTokenServiceEnv),),
      ...deps,
    };
  }

  async listUserApplications(userEmail: string, raw: Request): Promise<ApplicationResponse[]> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const applications: ConnectedApplicationMetadata[] = await applicationDAO.listMetadataByUserEmail(userEmail);
    return Promise.all(
      applications.map(async (application: ConnectedApplicationMetadata): Promise<ApplicationResponse> => {
        return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
      }),
    );
  }

  async createUserApplication(userEmail: string, input: CreateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const maxApplications: number = ConfigurationManager.getMaxApplicationsPerUser(this.env);
    if ((await applicationDAO.countByUserEmail(userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
    }

    const isImapPassword = input.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD;
    const credentials: ConnectedApplicationCredentials = isImapPassword
      ? { imapPassword: input.imapPassword ?? '' }
      : { clientId: input.clientId ?? '', clientSecret: input.clientSecret ?? '' };
    const status = isImapPassword ? CONNECTED_APPLICATION_STATUS_CONNECTED : CONNECTED_APPLICATION_STATUS_DRAFT;
    const imapConfig =
      input.imapHost || input.imapPort || input.imapUsername || input.smtpHost || input.smtpPort
        ? {
            host: input.imapHost ?? null,
            port: input.imapPort ?? null,
            username: input.imapUsername ?? null,
            smtpHost: input.smtpHost ?? null,
            smtpPort: input.smtpPort ?? null,
          }
        : null;
    const application: ConnectedApplicationMetadata = await applicationDAO.create(
      userEmail,
      input.displayName,
      input.providerId,
      input.connectionMethod ?? CONNECTION_METHOD_OAUTH2,
      credentials,
      status,
      input.gmailPubsubTopicName || null,
      input.enabledFeatures || null,
      input.timeZone || null,
      imapConfig,
      input.contentLanguage || null,
    );
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async updateUserApplication(userEmail: string, input: UpdateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const existing: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(input.applicationId, userEmail);
    if (!existing) {
      throw new NotFoundError('Connected application was not found.');
    }
    if (existing.providerId !== input.providerId || existing.connectionMethod !== input.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const isImapPassword = isImapPasswordApplication(existing);
    let credentials: ConnectedApplicationCredentials;
    let newStatus = existing.status;
    if (isImapPassword) {
      const existingPassword = (existing.credentials as { imapPassword?: string }).imapPassword ?? '';
      const newPassword = input.imapPassword || existingPassword;
      credentials = { imapPassword: newPassword };
    } else {
      const existingOAuth2 = existing.credentials as OAuth2Credentials;
      const newClientId = input.clientId || existingOAuth2.clientId;
      const newClientSecret = input.clientSecret || existingOAuth2.clientSecret;
      credentials = {
        clientId: newClientId,
        clientSecret: newClientSecret,
        refreshToken: existingOAuth2.refreshToken,
      };
      const credentialsChanged = newClientId !== existingOAuth2.clientId || newClientSecret !== existingOAuth2.clientSecret;
      const newFeatures = (input.enabledFeatures ?? []).filter((f) => !(existing.enabledFeatures ?? []).includes(f));
      const scopeRequiringFeatureAdded = newFeatures.some((f) => (OAUTH2_FEATURE_SCOPES[f]?.[existing.providerId]?.length ?? 0) > 0);
      if (credentialsChanged || scopeRequiringFeatureAdded) newStatus = CONNECTED_APPLICATION_STATUS_DRAFT;
    }

    const imapConfig =
      input.imapHost || input.imapPort || input.imapUsername || input.smtpHost || input.smtpPort
        ? {
            host: input.imapHost ?? null,
            port: input.imapPort ?? null,
            username: input.imapUsername ?? null,
            smtpHost: input.smtpHost ?? null,
            smtpPort: input.smtpPort ?? null,
          }
        : null;
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.updateForUser(
      input.applicationId,
      userEmail,
      input.displayName,
      credentials,
      newStatus,
      input.gmailPubsubTopicName || null,
      input.enabledFeatures,
      input.senderDomainFilters,
      input.timeZone,
      imapConfig,
      input.autoExecuteActionTypes,
      input.contentLanguage,
    );
    if (!application) {
      throw new NotFoundError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async updateWatchedFolderIds(userEmail: string, input: UpdateWatchedFolderIdsInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.updateWatchedFolderIdsForUser(
      input.applicationId,
      userEmail,
      input.folderIds,
      input.folderNames,
    );
    if (!application) {
      throw new NotFoundError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async deleteUserApplication(userEmail: string, applicationId: string): Promise<void> {
    try {
      const watchService = await this.deps.watchService();
      await watchService.stopApplicationWatch(userEmail, applicationId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ApplicationService] Stop watch failed during application deletion, proceeding: ${message}`);
    }

    const applicationDAO = await this.deps.applicationDAO();
    const contextDAO = await this.deps.contextDAO();
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(applicationId, userEmail);
    if (this.env.EMAIL_CONTEXT_INDEX) {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length > 0) await this.env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
      }
      await contextDAO.markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
    }
    if (this.env.OAUTH2_TOKEN_CACHE) {
      const tokenCacheDAO = await this.deps.tokenCacheDAO();
      await tokenCacheDAO.deleteAccessToken(applicationId);
    }
    await applicationDAO.deleteForUser(applicationId, userEmail);
  }

  // Ownership-checked metadata fetch for routes that operate on a single
  // application through other domain services (digest, context, rules).
  // Keeps DAO access inside the service layer instead of route handlers.
  async getOwnedApplication(userEmail: string, applicationId: string): Promise<ConnectedApplicationMetadata> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new NotFoundError('Connected application not found.');
    }
    return application;
  }

  async acknowledgeApplicationError(
    userEmail: string,
    applicationId: string,
    errorType: 'processing' | 'context',
    raw: Request,
  ): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.acknowledgeErrorForUser(
      applicationId,
      userEmail,
      errorType,
    );
    if (!application) {
      throw new NotFoundError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async listIntegrations(userEmail: string, applicationId: string): Promise<OutboundIntegration[]> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    const integrationDAO = await this.deps.integrationDAO();
    return integrationDAO.listByApplicationId(applicationId);
  }

  async createIntegration(userEmail: string, input: CreateIntegrationInput): Promise<OutboundIntegration> {
    await this.assertApplicationOwnership(userEmail, input.applicationId);
    const integrationDAO = await this.deps.integrationDAO();
    return integrationDAO.create(input.applicationId, input.integrationType, input.name, input.webhookUrl);
  }

  async updateIntegration(userEmail: string, input: UpdateIntegrationInput): Promise<OutboundIntegration> {
    const dao = await this.deps.integrationDAO();
    const existing = await dao.getByIdForUser(input.integrationId, userEmail);
    if (!existing) throw new NotFoundError('Integration not found.');
    return dao.update(input.integrationId, { name: input.name, enabled: input.enabled, webhookUrl: input.webhookUrl });
  }

  async deleteIntegration(userEmail: string, integrationId: string): Promise<void> {
    const dao = await this.deps.integrationDAO();
    const existing = await dao.getByIdForUser(integrationId, userEmail);
    if (!existing) throw new NotFoundError('Integration not found.');
    await dao.deleteById(integrationId);
  }

  async testIntegration(userEmail: string, integrationId: string): Promise<void> {
    const dao = await this.deps.integrationDAO();
    const integration = await dao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new NotFoundError('Integration not found.');
    const integrationService = await this.deps.integrationService();
    await integrationService.sendTestNotification(integration);
  }

  async listIntegrationDeliveries(userEmail: string, integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    const integrationDao = await this.deps.integrationDAO();
    const integration = await integrationDao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new NotFoundError('Integration not found.');
    const logDao = await this.deps.deliveryLogDAO();
    return logDao.listByIntegrationId(integrationId, limit);
  }

  async listLabels(userEmail: string, applicationId: string): Promise<Array<{ id: string; name: string }>> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    if (!this.env.OAUTH2_TOKEN_CACHE || !this.env.OAUTH2_TOKEN_REFRESHERS) return [];
    try {
      const tokenService = await this.deps.tokenService();
      const accessToken = await tokenService.getAccessToken(applicationId);
      const dao = await this.deps.applicationDAO();
      const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
      if (!app) return [];
      const provider = EmailProviderRegistry.get(app.providerId, app.connectionMethod);
      return (await provider.listLabels?.(accessToken)) ?? [];
    } catch (error: unknown) {
      console.warn('[ApplicationService] listLabels failed:', error);
      return [];
    }
  }

  async getRules(userEmail: string, applicationId: string): Promise<EmailProcessingRule[]> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    const dao = await this.deps.applicationDAO();
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    return app?.emailProcessingRules ?? [];
  }

  async updateRules(userEmail: string, applicationId: string, rules: EmailProcessingRule[]): Promise<ConnectedApplicationMetadata> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    const dao = await this.deps.applicationDAO();
    const updated = await dao.updateEmailProcessingRulesForUser(applicationId, userEmail, rules);
    if (!updated) throw new NotFoundError('Connected application not found.');
    return updated;
  }

  async suggestRule(userEmail: string, applicationId: string, description: string): Promise<Omit<EmailProcessingRule, 'ruleId'>> {
    if (!this.env.AI) throw new BadRequestError('AI is not configured.');
    await this.assertApplicationOwnership(userEmail, applicationId);
    const model = ConfigurationManager.getEmailSummaryModel(this.env);
    const { rule, usage } = await EmailRuleSuggestionUtil.suggestWithUsage(this.env.AI, model, description);
    await this.recordRuleSuggestionUsage(model, usage, description, rule);
    return rule;
  }

  private async recordRuleSuggestionUsage(
    model: string,
    usage: AiTextGenerationUsage | undefined,
    description: string,
    rule: Omit<EmailProcessingRule, 'ruleId'>,
  ): Promise<void> {
    try {
      const estimate = AiUsageUtil.estimateTextGenerationUsage(model, usage, description, JSON.stringify(rule));
      const usageDAO = await this.deps.usageDAO();
      await usageDAO.incrementUsage({
        usageDate: AiUsageUtil.getCurrentUtcUsageDate(),
        estimatedNeurons: estimate.estimatedNeurons,
        promptTokens: estimate.promptTokens,
        completionTokens: estimate.completionTokens,
      });
    } catch (error: unknown) {
      console.warn('Failed to record rule suggestion usage estimate:', error);
    }
  }

  private async assertApplicationOwnership(userEmail: string, applicationId: string): Promise<void> {
    const dao = await this.deps.applicationDAO();
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!app) throw new NotFoundError('Connected application not found.');
  }
}

const ApplicationServiceFactory = {
  create(env: ApplicationServiceEnv): ApplicationService {
    return new ApplicationService(env);
  },
};

interface CreateUserApplicationInput {
  displayName: string;
  providerId: string;
  connectionMethod?: string;
  clientId?: string;
  clientSecret?: string;
  gmailPubsubTopicName?: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  enabledFeatures?: string[] | null;
  timeZone?: string | null;
  contentLanguage?: string | null;
  senderDomainFilters?: SenderDomainFilters | null;
}

interface UpdateUserApplicationInput extends CreateUserApplicationInput {
  applicationId: string;
  connectionMethod: string;
  autoExecuteActionTypes?: string[] | null;
}

interface UpdateWatchedFolderIdsInput {
  applicationId: string;
  folderIds: string[] | null;
  folderNames?: Record<string, string>;
}

interface CreateIntegrationInput {
  applicationId: string;
  integrationType: OutboundIntegrationType;
  name: string;
  webhookUrl: string;
}

interface UpdateIntegrationInput {
  integrationId: string;
  name?: string;
  enabled?: boolean;
  webhookUrl?: string;
}

interface ApplicationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE?: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS?: DurableObjectNamespace;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  AI?: Ai;
  MAX_APPLICATIONS_PER_USER?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
  AI_SUMMARY_MODEL?: string;
}

export { ApplicationService, ApplicationServiceFactory };
export type {
  ApplicationServiceDeps,
  ApplicationServiceEnv,
  CreateIntegrationInput,
  CreateUserApplicationInput,
  UpdateIntegrationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
};

export { type ApplicationResponse } from './ApplicationResponseUtil';
