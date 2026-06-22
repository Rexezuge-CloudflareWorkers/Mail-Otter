import { CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ApplicationIntegrationDAO, ConnectedApplicationDAO, OAuth2AccessTokenCacheDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
  OutboundIntegration,
  OutboundIntegrationType,
  SenderDomainFilters,
} from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { EmailContextUtil } from '../email/EmailContextUtil';
import { IntegrationService } from '../integration/IntegrationService';
import type { IntegrationServiceEnv } from '../integration/IntegrationService';
import { WatchService } from '../subscription/WatchService';
import type { WatchServiceEnv } from '../subscription/WatchService';
import { ApplicationResponseUtil } from './ApplicationResponseUtil';
import type { ApplicationResponse } from './ApplicationResponseUtil';

class ApplicationService {
  public static async listUserApplications(userEmail: string, env: ApplicationServiceEnv, raw: Request): Promise<ApplicationResponse[]> {
    const applicationDAO: ConnectedApplicationDAO = await ApplicationService.createApplicationDAO(env);
    const applications: ConnectedApplicationMetadata[] = await applicationDAO.listMetadataByUserEmail(userEmail);
    return Promise.all(
      applications.map(async (application: ConnectedApplicationMetadata): Promise<ApplicationResponse> => {
        return ApplicationResponseUtil.decorateApplication(application, env, raw);
      }),
    );
  }

  public static async createUserApplication(
    userEmail: string,
    input: CreateUserApplicationInput,
    env: ApplicationServiceEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await ApplicationService.createApplicationDAO(env);
    const maxApplications: number = ConfigurationManager.getMaxApplicationsPerUser(env);
    if ((await applicationDAO.countByUserEmail(userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
    }

    const credentials: ConnectedApplicationCredentials = {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    };
    const application: ConnectedApplicationMetadata = await applicationDAO.create(
      userEmail,
      input.displayName,
      input.providerId,
      CONNECTION_METHOD_OAUTH2,
      credentials,
      CONNECTED_APPLICATION_STATUS_DRAFT,
      input.gmailPubsubTopicName || null,
      input.enabledFeatures || null,
      input.timeZone || null,
    );
    return ApplicationResponseUtil.decorateApplication(application, env, raw);
  }

  public static async updateUserApplication(
    userEmail: string,
    input: UpdateUserApplicationInput,
    env: ApplicationServiceEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await ApplicationService.createApplicationDAO(env);
    const existing: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(input.applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== input.providerId || existing.connectionMethod !== input.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const existingOAuth2 = existing.credentials as OAuth2Credentials;
    const newClientId = input.clientId || existingOAuth2.clientId;
    const newClientSecret = input.clientSecret || existingOAuth2.clientSecret;
    const credentials: ConnectedApplicationCredentials = {
      clientId: newClientId,
      clientSecret: newClientSecret,
      refreshToken: existingOAuth2.refreshToken,
    };
    const credentialsChanged = newClientId !== existingOAuth2.clientId || newClientSecret !== existingOAuth2.clientSecret;
    const newStatus = credentialsChanged ? CONNECTED_APPLICATION_STATUS_DRAFT : existing.status;
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
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, env, raw);
  }

  public static async updateWatchedFolderIds(
    userEmail: string,
    input: UpdateWatchedFolderIdsInput,
    env: ApplicationServiceEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await ApplicationService.createApplicationDAO(env);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.updateWatchedFolderIdsForUser(
      input.applicationId,
      userEmail,
      input.folderIds,
      input.folderNames,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, env, raw);
  }

  public static async deleteUserApplication(userEmail: string, applicationId: string, env: DeleteUserApplicationEnv): Promise<void> {
    try {
      await WatchService.stopApplicationWatch(userEmail, applicationId, env);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ApplicationService] Stop watch failed during application deletion, proceeding: ${message}`);
    }

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const contextDAO = new ApplicationContextDAO(env.DB);
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(applicationId, userEmail);
    if (env.EMAIL_CONTEXT_INDEX) {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length > 0) await env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
      }
      await contextDAO.markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
    }
    await new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE, masterKey).deleteAccessToken(applicationId);
    await applicationDAO.deleteForUser(applicationId, userEmail);
  }

  public static async acknowledgeApplicationError(
    userEmail: string,
    applicationId: string,
    errorType: 'processing' | 'context',
    env: ApplicationServiceEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await ApplicationService.createApplicationDAO(env);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.acknowledgeErrorForUser(applicationId, userEmail, errorType);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ApplicationResponseUtil.decorateApplication(application, env, raw);
  }

  public static async listIntegrations(
    userEmail: string,
    applicationId: string,
    env: IntegrationServiceEnv,
  ): Promise<OutboundIntegration[]> {
    await ApplicationService.assertApplicationOwnership(userEmail, applicationId, env);
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ApplicationIntegrationDAO(env.DB, masterKey).listByApplicationId(applicationId);
  }

  public static async createIntegration(
    userEmail: string,
    input: CreateIntegrationInput,
    env: IntegrationServiceEnv,
  ): Promise<OutboundIntegration> {
    await ApplicationService.assertApplicationOwnership(userEmail, input.applicationId, env);
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ApplicationIntegrationDAO(env.DB, masterKey).create(
      input.applicationId,
      input.integrationType,
      input.name,
      input.webhookUrl,
    );
  }

  public static async updateIntegration(
    userEmail: string,
    input: UpdateIntegrationInput,
    env: IntegrationServiceEnv,
  ): Promise<OutboundIntegration> {
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(env.DB, masterKey);
    const existing = await dao.getByIdForUser(input.integrationId, userEmail);
    if (!existing) throw new BadRequestError('Integration not found.');
    return dao.update(input.integrationId, {
      name: input.name,
      enabled: input.enabled,
      webhookUrl: input.webhookUrl,
    });
  }

  public static async deleteIntegration(
    userEmail: string,
    integrationId: string,
    env: IntegrationServiceEnv,
  ): Promise<void> {
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(env.DB, masterKey);
    const existing = await dao.getByIdForUser(integrationId, userEmail);
    if (!existing) throw new BadRequestError('Integration not found.');
    await dao.deleteById(integrationId);
  }

  public static async testIntegration(
    userEmail: string,
    integrationId: string,
    env: IntegrationServiceEnv,
  ): Promise<void> {
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ApplicationIntegrationDAO(env.DB, masterKey);
    const integration = await dao.getByIdForUser(integrationId, userEmail);
    if (!integration) throw new BadRequestError('Integration not found.');
    await IntegrationService.sendTestNotification(integration, env);
  }

  private static async assertApplicationOwnership(
    userEmail: string,
    applicationId: string,
    env: { DB: D1Queryable; AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret },
  ): Promise<void> {
    const masterKey = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ConnectedApplicationDAO(env.DB, masterKey);
    const app = await dao.getMetadataByIdForUser(applicationId, userEmail);
    if (!app) throw new BadRequestError('Connected application not found.');
  }

  private static async createApplicationDAO(env: ApplicationServiceEnv): Promise<ConnectedApplicationDAO> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ConnectedApplicationDAO(env.DB, masterKey);
  }
}

interface CreateUserApplicationInput {
  displayName: string;
  providerId: 'google-gmail' | 'microsoft-outlook';
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName?: string | undefined;
  enabledFeatures?: string[] | null | undefined;
  timeZone?: string | null | undefined;
  senderDomainFilters?: SenderDomainFilters | null | undefined;
}

interface UpdateUserApplicationInput extends Omit<CreateUserApplicationInput, 'clientId' | 'clientSecret'> {
  applicationId: string;
  connectionMethod: typeof CONNECTION_METHOD_OAUTH2;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
}

interface ApplicationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

interface DeleteUserApplicationEnv extends ApplicationServiceEnv, WatchServiceEnv {
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
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
  name?: string | undefined;
  enabled?: boolean | undefined;
  webhookUrl?: string | undefined;
}

export { ApplicationService };
export type {
  ApplicationServiceEnv,
  CreateIntegrationInput,
  CreateUserApplicationInput,
  DeleteUserApplicationEnv,
  UpdateIntegrationInput,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
};
