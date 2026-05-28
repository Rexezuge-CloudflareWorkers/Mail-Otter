import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationContextDeletionRun } from '@mail-otter/shared/model';
import { ContextService } from '@mail-otter/backend-services/email';

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
    return { deletionRun: await ContextService.deleteDocuments(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, env) };
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
