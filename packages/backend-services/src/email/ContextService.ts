import {
  APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
  APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
  CONTEXT_AUDIT_EVENT_DOCUMENT_DELETED,
  CONTEXT_AUDIT_LOG_SEVERITY_INFO,
} from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
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
import { EmailProviderRegistry } from '../provider/EmailProviderRegistry';
import { EmailContextUtil } from './EmailContextUtil';

interface ContextServiceDeps {
  contextDAO?: () => Promise<ApplicationContextDAO>;
  applicationDAO?: () => Promise<ConnectedApplicationDAO>;
  providerRegistry?: {
    get(providerId: string): {
      getProviderUrl(document: ApplicationContextDocumentSource, application: ConnectedApplicationMetadata): string;
    };
  };
}

class ContextService {
  private readonly deps: Required<ContextServiceDeps>;

  constructor(
    private readonly env: ContextServiceEnv,
    deps: ContextServiceDeps = {},
  ) {
    const db = env.DB;
    this.deps = {
      contextDAO: () => Promise.resolve(new ApplicationContextDAO(db),),
      applicationDAO: async () => {
        if (!env.AES_ENCRYPTION_KEY_SECRET) throw new Error('AES_ENCRYPTION_KEY_SECRET is required for this operation.');
        return new ConnectedApplicationDAO(db, await env.AES_ENCRYPTION_KEY_SECRET.get());
      },
      providerRegistry: EmailProviderRegistry,
      ...deps,
    };
  }

  async updateContextSettings(userEmail: string, input: UpdateContextSettingsInput, raw: Request): Promise<ApplicationResponse> {
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    let application: ConnectedApplicationMetadata | undefined;

    if (input.contextIndexingEnabled !== undefined) {
      application = await applicationDAO.updateContextIndexingForUser(input.applicationId, userEmail, input.contextIndexingEnabled);
      if (!application) throw new NotFoundError('Connected application was not found.');
    }

    if (input.ragRetrievalEnabled !== undefined) {
      application = await applicationDAO.updateRagRetrievalForUser(input.applicationId, userEmail, input.ragRetrievalEnabled);
      if (!application) throw new NotFoundError('Connected application was not found.');
    }

    if ('maxContextDocuments' in input) {
      application = await applicationDAO.updateMaxContextDocumentsForUser(
        input.applicationId,
        userEmail,
        input.maxContextDocuments ?? null,
      );
      if (!application) throw new NotFoundError('Connected application was not found.');
    }

    if (input.attachmentVisionEnabled !== undefined) {
      application = await applicationDAO.updateAttachmentVisionEnabledForUser(
        input.applicationId,
        userEmail,
        input.attachmentVisionEnabled,
      );
      if (!application) throw new NotFoundError('Connected application was not found.');
    }

    if (!application) {
      application = await applicationDAO.getMetadataByIdForUser(input.applicationId, userEmail);
      if (!application) throw new NotFoundError('Connected application was not found.');
    }

    return ApplicationResponseUtil.decorateApplication(application, this.env, raw);
  }

  async pruneApplicationDocuments(applicationId: string, userEmail: string, activeCount: number, effectiveLimit: number): Promise<void> {
    const excessCount: number = activeCount - effectiveLimit;
    if (excessCount <= 0) return;
    if (!this.env.EMAIL_CONTEXT_INDEX) return;

    const contextDAO = await this.deps.contextDAO();
    const vectorNamespace: string = await EmailContextUtil.getUserVectorNamespace(userEmail);
    const vectorIds: string[] = await contextDAO.listOldestActiveVectorIdsForApplication(applicationId, userEmail, excessCount);
    if (vectorIds.length === 0) return;

    const mutationIds: string[] = [];
    try {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length === 0) continue;
        const mutation = await this.env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
        if ('mutationId' in mutation && mutation.mutationId) {
          mutationIds.push(mutation.mutationId);
        }
      }
      await contextDAO.markDocumentsDeletedByVectorIds(applicationId, userEmail, vectorIds);
      await this.logDocumentDeletions(contextDAO, applicationId, userEmail, vectorIds);
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

  async listDocuments(userEmail: string, input: ListContextDocumentsInput): Promise<ApplicationContextDocumentList> {
    const contextDAO = await this.deps.contextDAO();
    return contextDAO.listDocumentsForUser(userEmail, input);
  }

  async listDeletionRuns(userEmail: string, input: ListDeletionRunsInput): Promise<ApplicationContextDeletionRunList> {
    const contextDAO = await this.deps.contextDAO();
    return contextDAO.listDeletionRunsForUser(userEmail, input);
  }

  async deleteDocuments(userEmail: string, applicationId: string): Promise<ApplicationContextDeletionRun> {
    if (!this.env.EMAIL_CONTEXT_INDEX) {
      throw new BadRequestError('Context index is not configured.');
    }
    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(applicationId, userEmail);
    if (!application) {
      throw new NotFoundError('Connected application was not found.');
    }

    const contextDAO = await this.deps.contextDAO();
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(application.applicationId, userEmail);
    const vectorNamespace: string = await EmailContextUtil.getUserVectorNamespace(userEmail);
    const mutationIds: string[] = [];
    try {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length === 0) continue;
        const mutation = await this.env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
        if ('mutationId' in mutation && mutation.mutationId) {
          mutationIds.push(mutation.mutationId);
        }
      }
      await contextDAO.markDocumentsDeletedByVectorIds(application.applicationId, userEmail, vectorIds);
      await this.logDocumentDeletions(contextDAO, application.applicationId, userEmail, vectorIds);
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

  async listAuditLogs(userEmail: string, contextDocumentId: string, cursor?: string): Promise<ContextAuditLogList> {
    const contextDAO = await this.deps.contextDAO();
    const document: ApplicationContextDocumentSource | undefined = await contextDAO.getDocumentSourceForUser(contextDocumentId, userEmail);
    if (!document) {
      throw new NotFoundError('Context document was not found.');
    }
    return contextDAO.listAuditLogs(contextDocumentId, { cursor });
  }

  async getDocumentProviderLink(userEmail: string, contextDocumentId: string): Promise<string> {
    const contextDAO = await this.deps.contextDAO();
    const document: ApplicationContextDocumentSource | undefined = await contextDAO.getDocumentSourceForUser(contextDocumentId, userEmail);
    if (!document) {
      throw new NotFoundError('Context document was not found.');
    }

    const applicationDAO: ConnectedApplicationDAO = await this.deps.applicationDAO();
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      document.applicationId,
      userEmail,
    );
    if (!application) {
      throw new NotFoundError('Connected application was not found.');
    }
    return this.deps.providerRegistry.get(document.sourceProviderId).getProviderUrl(document, application);
  }

  private async logDocumentDeletions(
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
        eventLabel: 'Document Deleted From Context Index',
        severity: CONTEXT_AUDIT_LOG_SEVERITY_INFO,
      })),
    );
  }
}

const ContextServiceFactory = {
  create(env: ContextServiceEnv): ContextService {
    return new ContextService(env);
  },
};

interface UpdateContextSettingsInput {
  applicationId: string;
  contextIndexingEnabled?: boolean;
  ragRetrievalEnabled?: boolean;
  maxContextDocuments?: number | null;
  attachmentVisionEnabled?: boolean;
}

interface ListContextDocumentsInput {
  applicationId?: string;
  status?: ApplicationContextDocumentStatus;
  cursor?: string;
}

interface ListDeletionRunsInput {
  applicationId?: string;
  cursor?: string;
}

interface ContextServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET?: SecretsStoreSecret;
  EMAIL_CONTEXT_INDEX?: Vectorize;
}

export { ContextService, ContextServiceFactory };
export type { ContextServiceDeps, ContextServiceEnv, ListContextDocumentsInput, ListDeletionRunsInput, UpdateContextSettingsInput };
