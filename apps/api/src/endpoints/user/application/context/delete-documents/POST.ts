import { APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED, APPLICATION_CONTEXT_DELETION_STATUS_ERROR } from '@mail-otter/shared/constants';
import { ApplicationContextDAO, ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationContextDeletionRun, ConnectedApplicationMetadata } from '@mail-otter/shared/model';
import { EmailContextUtil } from '@/utils';

class DeleteApplicationContextDocumentsRoute extends IUserRoute<
  DeleteApplicationContextDocumentsRequest,
  DeleteApplicationContextDocumentsResponse,
  DeleteApplicationContextDocumentsEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Delete indexed context documents for one connected application',
    responses: {
      '200': {
        description: 'Application context documents deletion accepted',
      },
    },
  };

  protected async handleRequest(
    request: DeleteApplicationContextDocumentsRequest,
    env: DeleteApplicationContextDocumentsEnv,
    cxt: RouteContext<DeleteApplicationContextDocumentsEnv>,
  ): Promise<DeleteApplicationContextDocumentsResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await applicationDAO.getMetadataByIdForUser(
      request.applicationId,
      userEmail,
    );
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
      const deletionRun: ApplicationContextDeletionRun = await contextDAO.recordDeletionRun({
        applicationId: application.applicationId,
        userEmail,
        vectorNamespace,
        requestedVectorCount: vectorIds.length,
        deletedVectorCount: vectorIds.length,
        mutationIds,
        status: APPLICATION_CONTEXT_DELETION_STATUS_ACCEPTED,
      });
      return { deletionRun };
    } catch (error: unknown) {
      const deletionRun: ApplicationContextDeletionRun = await contextDAO.recordDeletionRun({
        applicationId: application.applicationId,
        userEmail,
        vectorNamespace,
        requestedVectorCount: vectorIds.length,
        deletedVectorCount: 0,
        mutationIds,
        status: APPLICATION_CONTEXT_DELETION_STATUS_ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return { deletionRun };
    }
  }
}

interface DeleteApplicationContextDocumentsRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationContextDocumentsResponse extends IResponse {
  deletionRun: ApplicationContextDeletionRun;
}

interface DeleteApplicationContextDocumentsEnv extends IUserEnv {
  EMAIL_CONTEXT_INDEX: Vectorize;
}

export { DeleteApplicationContextDocumentsRoute };
