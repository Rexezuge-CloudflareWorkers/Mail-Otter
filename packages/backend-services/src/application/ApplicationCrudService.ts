import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTION_METHOD_IMAP_PASSWORD,
  CONNECTION_METHOD_OAUTH2,
  OAUTH2_FEATURE_SCOPES,
} from '@mail-otter/shared/constants';
import type {
  ApplicationContextDAO,
  ConnectedApplicationDAO,
  OAuth2AccessTokenCacheDAO,
} from '@mail-otter/backend-data/dao';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
import { isImapPasswordApplication } from '@mail-otter/shared/model';
import type {
  ConnectedApplication,
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
} from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { EmailContextUtil } from '../email/EmailContextUtil';
import { WatchService } from '../subscription/WatchService';
import { ApplicationResponseUtil } from './ApplicationResponseUtil';
import type { ApplicationResponse } from './ApplicationResponseUtil';
import type { ApplicationServiceDeps, ApplicationServiceEnv, CreateUserApplicationInput, UpdateUserApplicationInput, UpdateWatchedFolderIdsInput } from './ApplicationServiceTypes';

/**
 * CRUD slice of `ApplicationService` (list/create/update/delete/ownership).
 * Extracted so `ApplicationService.ts` stays a thin facade (<150 LOC).
 */
class ApplicationCrudService {
  constructor(
    private readonly env: ApplicationServiceEnv,
    private readonly deps: Required<Pick<ApplicationServiceDeps, 'applicationDAO' | 'contextDAO' | 'tokenCacheDAO' | 'watchService'>>,
  ) {}

  public async listUserApplications(userEmail: string, raw: Request): Promise<ApplicationResponse[]> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const applications: ConnectedApplicationMetadata[] = await applicationDAO.listMetadataByUserEmail(userEmail);
    return Promise.all(
      applications.map(async (application: ConnectedApplicationMetadata): Promise<ApplicationResponse> => {
        return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
      }),
    );
  }

  public async createUserApplication(userEmail: string, input: CreateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
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

  public async updateUserApplication(userEmail: string, input: UpdateUserApplicationInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const existing: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(input.applicationId, userEmail);
    if (!existing) throw new NotFoundError('Connected application was not found.');
    if (existing.providerId !== input.providerId || existing.connectionMethod !== input.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const isImapPassword = isImapPasswordApplication(existing);
    let credentials: ConnectedApplicationCredentials;
    let newStatus = existing.status;
    if (isImapPassword) {
      const existingPassword = (existing.credentials as { imapPassword?: string }).imapPassword ?? '';
      credentials = { imapPassword: input.imapPassword || existingPassword };
    } else {
      const existingOAuth2 = existing.credentials as OAuth2Credentials;
      const newClientId = input.clientId || existingOAuth2.clientId;
      const newClientSecret = input.clientSecret || existingOAuth2.clientSecret;
      credentials = { clientId: newClientId, clientSecret: newClientSecret, refreshToken: existingOAuth2.refreshToken };
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
    if (!application) throw new NotFoundError('Connected application was not found.');
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  public async updateWatchedFolderIds(userEmail: string, input: UpdateWatchedFolderIdsInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.updateWatchedFolderIdsForUser(
      input.applicationId,
      userEmail,
      input.folderIds,
      input.folderNames,
    );
    if (!application) throw new NotFoundError('Connected application was not found.');
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  public async deleteUserApplication(userEmail: string, applicationId: string): Promise<void> {
    try {
      const watchService: WatchService = await this.deps.watchService();
      await watchService.stopApplicationWatch(userEmail, applicationId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ApplicationService] Stop watch failed during application deletion, proceeding: ${message}`);
    }

    const applicationDAO = await this.deps.applicationDAO();
    const contextDAO: ApplicationContextDAO = await this.deps.contextDAO();
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(applicationId, userEmail);
    if (this.env.EMAIL_CONTEXT_INDEX) {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length > 0) await this.env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
      }
      await contextDAO.markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
    }
    if (this.env.OAUTH2_TOKEN_CACHE) {
      const tokenCacheDAO: OAuth2AccessTokenCacheDAO = await this.deps.tokenCacheDAO();
      await tokenCacheDAO.deleteAccessToken(applicationId);
    }
    await applicationDAO.deleteForUser(applicationId, userEmail);
  }

  public async getOwnedApplication(userEmail: string, applicationId: string): Promise<ConnectedApplicationMetadata> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(applicationId, userEmail);
    if (!application) throw new NotFoundError('Connected application not found.');
    return application;
  }

  public async acknowledgeApplicationError(
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
    if (!application) throw new NotFoundError('Connected application was not found.');
    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }
}

export { ApplicationCrudService };
