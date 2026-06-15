import {
  APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
  APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
  CONTEXT_AUDIT_EVENT_DOCUMENT_DELETED,
  CONTEXT_AUDIT_LOG_SEVERITY_INFO,
} from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDeletionRunList,
  ApplicationContextDocumentList,
  ApplicationContextDocumentSource,
  ConnectedApplicationMetadata,
  ContextAuditLogList,
} from '@mail-otter/shared/model';
import type { ApplicationContextDocumentStatus } from '@mail-otter/shared/constants';
import { ApplicationResponseUtil } from '../application/ApplicationResponseUtil';
import type { ApplicationResponse } from '../application/ApplicationResponseUtil';
import { EmailContextUtil } from './EmailContextUtil';

class ContextService {
  public static async updateContextSettings(
    userEmail: string,
    input: UpdateContextSettingsInput,
    env: ContextServiceEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await ContextService.createApplicationDAO(env);
    let application: ConnectedApplicationMetadata | undefined;

    if (input.contextIndexingEnabled !== undefined) {
      application = await applicationDAO.updateContextIndexingForUser(input.applicationId, userEmail, input.contextIndexingEnabled);
      if (!application) throw new BadRequestError('Connected application was not found.');
    }

    if ('maxContextDocuments' in input) {
      application = await applicationDAO.updateMaxContextDocumentsForUser(input.applicationId, userEmail, input.maxContextDocuments ?? null);
      if (!application) throw new BadRequestError('Connected application was not found.');
    }

    if (!application) {
      application = await applicationDAO.getMetadataByIdForUser(input.applicationId, userEmail);
      if (!application) throw new BadRequestError('Connected application was not found.');
    }

    return ApplicationResponseUtil.decorateApplication(application, env, raw);
  }

  public static async pruneApplicationDocuments(
    applicationId: string,
    userEmail: string,
    activeCount: number,
    effectiveLimit: number,
    env: PruneDocumentsEnv,
  ): Promise<void> {
    const excessCount: number = activeCount - effectiveLimit;
    if (excessCount <= 0) return;

    const contextDAO = new ApplicationContextDAO(env.DB);
    const vectorNamespace: string = await EmailContextUtil.getUserVectorNamespace(userEmail);
    const vectorIds: string[] = await contextDAO.listOldestActiveVectorIdsForApplication(applicationId, userEmail, excessCount);
    if (vectorIds.length === 0) return;

    const mutationIds: string[] = [];
    try {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length === 0) continue;
        const mutation = await env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
        if ('mutationId' in mutation && mutation.mutationId) {
          mutationIds.push(mutation.mutationId as string);
        }
      }
      await contextDAO.markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
      await ContextService.logDocumentDeletions(contextDAO, applicationId, userEmail, vectorIds);
      await contextDAO.recordDeletionRun({
        applicationId,
        userEmail,
        vectorNamespace,
        requestedVectorCount: vectorIds.length,
        deletedVectorCount: vectorIds.length,
        mutationIds,
        status: APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
      });
    } catch (error: unknown) {
      await contextDAO.recordDeletionRun({
        applicationId,
        userEmail,
        vectorNamespace,
        requestedVectorCount: vectorIds.length,
        deletedVectorCount: 0,
        mutationIds,
        status: APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public static async listDocuments(userEmail: string, input: ListContextDocumentsInput, env: ContextListEnv): Promise<ApplicationContextDocumentList> {
    const contextDAO = new ApplicationContextDAO(env.DB);
    return contextDAO.listDocumentsForUser(userEmail, input);
  }

  public static async listDeletionRuns(userEmail: string, input: ListDeletionRunsInput, env: ContextListEnv): Promise<ApplicationContextDeletionRunList> {
    const contextDAO = new ApplicationContextDAO(env.DB);
    return contextDAO.listDeletionRunsForUser(userEmail, input);
  }

  public static async deleteDocuments(
    userEmail: string,
    applicationId: string,
    env: DeleteContextDocumentsEnv,
  ): Promise<ApplicationContextDeletionRun> {
    const applicationDAO: ConnectedApplicationDAO = await ContextService.createApplicationDAO(env);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }

    const contextDAO = new ApplicationContextDAO(env.DB);
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(application.applicationId, userEmail);
    const vectorNamespace: string = await EmailContextUtil.getUserVectorNamespace(userEmail);
    const mutationIds: string[] = [];
    try {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length === 0) continue;
        const mutation = await env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
        if ('mutationId' in mutation && mutation.mutationId) {
          mutationIds.push(mutation.mutationId);
        }
      }
      await contextDAO.markDocumentsDeletedByVectorIds(application.applicationId, userEmail, vectorIds);
      await ContextService.logDocumentDeletions(contextDAO, application.applicationId, userEmail, vectorIds);
      return contextDAO.recordDeletionRun({
        applicationId: application.applicationId,
        userEmail,
        vectorNamespace,
        requestedVectorCount: vectorIds.length,
        deletedVectorCount: vectorIds.length,
        mutationIds,
        status: APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
      });
    } catch (error: unknown) {
      return contextDAO.recordDeletionRun({
        applicationId: application.applicationId,
        userEmail,
        vectorNamespace,
        requestedVectorCount: vectorIds.length,
        deletedVectorCount: 0,
        mutationIds,
        status: APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  public static async listAuditLogs(
    userEmail: string,
    contextDocumentId: string,
    env: ContextListEnv,
    cursor?: string | undefined,
  ): Promise<ContextAuditLogList> {
    const contextDAO = new ApplicationContextDAO(env.DB);
    const document: ApplicationContextDocumentSource | undefined = await contextDAO.getDocumentSourceForUser(contextDocumentId, userEmail);
    if (!document) {
      throw new BadRequestError('Context document was not found.');
    }
    return contextDAO.listAuditLogs(contextDocumentId, { cursor });
  }

  public static async getDocumentProviderLink(userEmail: string, contextDocumentId: string, env: ContextServiceEnv): Promise<string> {
    const contextDAO = new ApplicationContextDAO(env.DB);
    const document: ApplicationContextDocumentSource | undefined = await contextDAO.getDocumentSourceForUser(contextDocumentId, userEmail);
    if (!document) {
      throw new BadRequestError('Context document was not found.');
    }

    const applicationDAO: ConnectedApplicationDAO = await ContextService.createApplicationDAO(env);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(document.applicationId, userEmail);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return ContextService.getProviderUrl(document, application);
  }

  private static async createApplicationDAO(env: ContextServiceEnv): Promise<ConnectedApplicationDAO> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    return new ConnectedApplicationDAO(env.DB, masterKey);
  }

  private static async logDocumentDeletions(
    contextDAO: ApplicationContextDAO,
    applicationId: string,
    userEmail: string,
    vectorIds: string[],
  ): Promise<void> {
    const documents: Array<{ contextDocumentId: string; sourceDocumentId: string | null }> = await contextDAO.getDocumentSourcesByVectorIds(
      applicationId,
      userEmail,
      vectorIds,
    );
    if (documents.length === 0) return;
    await contextDAO.insertAuditLogs(
      documents.map((doc) => ({
        contextDocumentId: doc.contextDocumentId,
        applicationId,
        userEmail,
        sourceDocumentId: doc.sourceDocumentId,
        eventType: CONTEXT_AUDIT_EVENT_DOCUMENT_DELETED,
        eventLabel: 'Document deleted from context index',
        severity: CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      })),
    );
  }

  private static getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string {
    if (document.sourceProviderId === PROVIDER_GOOGLE_GMAIL) {
      const url = new URL('https://mail.google.com/mail/u/');
      if (application.providerEmail) url.searchParams.set('authuser', application.providerEmail);
      url.hash = `all/${document.sourceThreadId || document.sourceDocumentId}`;
      return url.toString();
    }

    if (document.sourceProviderId === PROVIDER_MICROSOFT_OUTLOOK) {
      const url = new URL(`https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(document.sourceDocumentId)}`);
      if (application.providerEmail) url.searchParams.set('login_hint', application.providerEmail);
      return url.toString();
    }

    throw new BadRequestError('Unsupported context document provider.');
  }
}

interface UpdateContextSettingsInput {
  applicationId: string;
  contextIndexingEnabled?: boolean | undefined;
  maxContextDocuments?: number | null | undefined;
}

interface ListContextDocumentsInput {
  applicationId?: string | undefined;
  status?: ApplicationContextDocumentStatus | undefined;
  cursor?: string | undefined;
}

interface ListDeletionRunsInput {
  applicationId?: string | undefined;
  cursor?: string | undefined;
}

interface ContextListEnv {
  DB: D1Queryable;
}

interface ContextServiceEnv extends ContextListEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

interface DeleteContextDocumentsEnv extends ContextServiceEnv {
  EMAIL_CONTEXT_INDEX: Vectorize;
}

interface PruneDocumentsEnv {
  DB: D1Queryable;
  EMAIL_CONTEXT_INDEX: Vectorize;
}

export { ContextService };
export type {
  ContextListEnv,
  ContextServiceEnv,
  DeleteContextDocumentsEnv,
  ListContextDocumentsInput,
  ListDeletionRunsInput,
  PruneDocumentsEnv,
  UpdateContextSettingsInput,
};
