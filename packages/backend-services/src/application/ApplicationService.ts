import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_IMAP_PASSWORD,
  CONNECTION_METHOD_OAUTH2,
  OAUTH2_FEATURE_SCOPES,
} from '@mail-otter/shared/constants';
import { AiDailyUsageDAO, ApplicationContextDAO, ApplicationIntegrationDAO, ConnectedApplicationDAO, IntegrationDeliveryLogDAO, OAuth2AccessTokenCacheDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
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

class ApplicationService {
  constructor(private readonly env: ApplicationServiceEnv) {}

  async listUserApplications(userEmail: string, raw: Request): Promise<ApplicationResponse[]> {
    const applicationDAO: ConnectedApplicationDAO = await this.createApplicationDAO();
    const applications: ConnectedApplicationMetadata[] = await applicationDAO.listMetadataByUserEmail(userEmail);
    return Promise.all(
      applications.map(async (application: ConnectedApplicationMetadata): Promise<ApplicationResponse> => {
        return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
      }),
    );
  }

  async createUserApplication(userEmail: string, input: CreateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.createApplicationDAO();
    const maxApplications: number = ConfigurationManager.getMaxApplicationsPerUser(this.env);
    if ((await applicationDAO.countByUserEmail(userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
    }

    const isImapPassword = input.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD;
    const credentials: ConnectedApplicationCredentials = isImapPassword
      ? { imapPassword: input.imapPassword ?? '' }
      : { clientId: input.clientId ?? '', clientSecret: input.clientSecret ?? '' };
    const status = isImapPassword ? CONNECTED_APPLICATION_STATUS_CONNECTED : CONNECTED_APPLICATION_STATUS_DRAFT;
    const imapConfig = (input.imapHost || input.imapPort || input.imapUsername || input.smtpHost || input.smtpPort)
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
    );
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async updateUserApplication(userEmail: string, input: UpdateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.createApplicationDAO();
    const existing: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(input.applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== input.providerId || existing.connectionMethod !== input.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const isImapPassword = existing.connectionMethod === CONNECTION_METHOD_IMAP_PASSWORD;
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
      const newFeatures = (input.enabledFeatures ?? []).filter(f => !(existing.enabledFeatures ?? []).includes(f));
      const scopeRequiringFeatureAdded = newFeatures.some(f => (OAUTH2_FEATURE_SCOPES[f]?.[existing.providerId]?.length ?? 0) > 0);
      if (credentialsChanged || scopeRequiringFeatureAdded) newStatus = CONNECTED_APPLICATION_STATUS_DRAFT;
    }

    const imapConfig = (input.imapHost || input.imapPort || input.imapUsername || input.smtpHost || input.smtpPort)
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
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async updateWatchedFolderIds(userEmail: string, input: UpdateWatchedFolderIdsInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.createApplicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.updateWatchedFolderIdsForUser(
      input.applicationId, userEmail, input.folderIds, input.folderNames,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async deleteUserApplication(userEmail: string, applicationId: string): Promise<void> {
    try {
      await new WatchService(this.env as WatchServiceEnv).stopApplicationWatch(userEmail, applicationId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ApplicationService] Stop watch failed during application deletion, proceeding: ${message}`);
    }

    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const contextDAO = new ApplicationContextDAO(this.env.DB);
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(applicationId, userEmail);
    if (this.env.EMAIL_CONTEXT_INDEX) {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length > 0) await this.env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
      }
      await contextDAO.markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
    }
    if (this.env.OAUTH2_TOKEN_CACHE) {
      await new OAuth2AccessTokenCacheDAO(this.env.OAUTH2_TOKEN_CACHE, masterKey).deleteAccessToken(applicationId);
    }
    await applicationDAO.deleteForUser(applicationId, userEmail);
  }

  async acknowledgeApplicationError(userEmail: string, applicationId: string, errorType: 'processing' | 'context', raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.createApplicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.acknowledgeErrorForUser(applicationId, userEmail, errorType);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async listIntegrations(userEmail: string, applicationId: string): Promise<OutboundIntegration[]> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ApplicationIntegrationDAO(this.env.DB, masterKey).listByApplicationId(applicationId);
  }

  async createIntegration(userEmail: string, input: CreateIntegrationInput): Promise<OutboundIntegration> {
    await this.assertApplicationOwnership(userEmail, input.applicationId);
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ApplicationIntegrationDAO(this.env.DB, masterKey).create(
      input.applicationId, input.integrationType, input.name, input.webhookUrl,
    );
  }

  async updateIntegration(userEmail: string, input: UpdateIntegrationInput): Promise<OutboundIntegration> {
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(this.env.DB, masterKey);
    const existing = await dao.getByIdForUser(input.integrationId, userEmail);
    if (!existing) throw new BadRequestError('Integration not found.');
    return dao.update(input.integrationId, { name: input.name, enabled: input.enabled, webhookUrl: input.webhookUrl });
  }

  async deleteIntegration(userEmail: string, integrationId: string): Promise<void> {
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(this.env.DB, masterKey);
    const existing = await dao.getByIdForUser(integrationId, userEmail);
    if (!existing) throw new BadRequestError('Integration not found.');
    await dao.deleteById(integrationId);
  }

  async testIntegration(userEmail: string, integrationId: string): Promise<void> {
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(this.env.DB, masterKey);
    const integration = await dao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new BadRequestError('Integration not found.');
    await new IntegrationService(this.env).sendTestNotification(integration);
  }

  async listIntegrationDeliveries(userEmail: string, integrationId: string, limit: number): Promise<IntegrationDeliveryLog[]> {
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const integrationDao = new ApplicationIntegrationDAO(this.env.DB, masterKey);
    const integration = await integrationDao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new BadRequestError('Integration not found.');
    const logDao = new IntegrationDeliveryLogDAO(this.env.DB);
    return logDao.listByIntegrationId(integrationId, limit);
  }

  async listLabels(userEmail: string, applicationId: string): Promise<Array<{ id: string; name: string }>> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    if (!this.env.OAUTH2_TOKEN_CACHE || !this.env.OAUTH2_TOKEN_REFRESHERS) return [];
    try {
      const accessToken = await new OAuth2AccessTokenService(this.env as OAuth2AccessTokenServiceEnv).getAccessToken(applicationId);
      const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
      const dao = new ConnectedApplicationDAO(this.env.DB, masterKey);
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
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    return app?.emailProcessingRules ?? [];
  }

  async updateRules(userEmail: string, applicationId: string, rules: EmailProcessingRule[]): Promise<ConnectedApplicationMetadata> {
    await this.assertApplicationOwnership(userEmail, applicationId);
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const updated = await dao.updateEmailProcessingRulesForUser(applicationId, userEmail, rules);
    if (!updated) throw new BadRequestError('Connected application not found.');
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
      await new AiDailyUsageDAO(this.env.DB).incrementUsage({
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
    const masterKey = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!app) throw new BadRequestError('Connected application not found.');
  }

  private async createApplicationDAO(): Promise<ConnectedApplicationDAO> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ConnectedApplicationDAO(this.env.DB, masterKey);
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
  ApplicationServiceEnv,
  
  CreateIntegrationInput,
  CreateUserApplicationInput,
  UpdateIntegrationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
};

export {type ApplicationResponse} from './ApplicationResponseUtil';