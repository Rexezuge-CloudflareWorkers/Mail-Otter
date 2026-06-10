import { CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ConnectedApplicationDAO, OAuth2AccessTokenCacheDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { EmailContextUtil } from '../email/EmailContextUtil';
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

    const credentials: ConnectedApplicationCredentials = {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      refreshToken: (existing.credentials as OAuth2Credentials).refreshToken,
    };
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.updateForUser(
      input.applicationId,
      userEmail,
      input.displayName,
      credentials,
      CONNECTED_APPLICATION_STATUS_DRAFT,
      input.gmailPubsubTopicName || null,
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
}

interface UpdateUserApplicationInput extends CreateUserApplicationInput {
  applicationId: string;
  connectionMethod: typeof CONNECTION_METHOD_OAUTH2;
}

interface ApplicationServiceEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

interface DeleteUserApplicationEnv extends ApplicationServiceEnv {
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
  OAUTH2_TOKEN_CACHE: KVNamespace;
}

interface UpdateWatchedFolderIdsInput {
  applicationId: string;
  folderIds: string[] | null;
  folderNames?: Record<string, string>;
}

export { ApplicationService };
export type {
  ApplicationServiceEnv,
  CreateUserApplicationInput,
  DeleteUserApplicationEnv,
  UpdateUserApplicationInput,
  UpdateWatchedFolderIdsInput,
};
