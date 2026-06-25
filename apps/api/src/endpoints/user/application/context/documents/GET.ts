import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationContextDocument } from '@mail-otter/shared/model';
import type { ApplicationContextDocumentStatus } from '@mail-otter/shared/constants';
import { ContextService } from '@mail-otter/backend-services/email';

class ListApplicationContextDocumentsRoute extends IUserRoute<
  ListApplicationContextDocumentsRequest,
  ListApplicationContextDocumentsResponse,
  ListApplicationContextDocumentsEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'List indexed context documents for the authenticated user',
    responses: {
      '200': {
        description: 'Application context documents',
      },
    },
  };

  protected async handleRequest(
    request: ListApplicationContextDocumentsRequest,
    env: ListApplicationContextDocumentsEnv,
    cxt: RouteContext<ListApplicationContextDocumentsEnv>,
  ): Promise<ListApplicationContextDocumentsResponse> {
    return new ContextService(env).listDocuments(this.getAuthenticatedUserEmailAddress(cxt), { applicationId: this.getQueryParam(request, 'applicationId'), status: this.getQueryParam(request, 'status') as ApplicationContextDocumentStatus | undefined, cursor: this.getQueryParam(request, 'cursor') });
  }
}

type ListApplicationContextDocumentsRequest = IRequest;

interface ListApplicationContextDocumentsResponse extends IResponse {
  documents: ApplicationContextDocument[];
  nextCursor?: string;
}

type ListApplicationContextDocumentsEnv = IUserEnv;

export { ListApplicationContextDocumentsRoute };
