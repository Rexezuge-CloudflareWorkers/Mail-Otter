import { ApplicationContextDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationContextDocument } from '@mail-otter/shared/model';
import type { ApplicationContextDocumentStatus } from '@mail-otter/shared/constants';

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
    const url = new URL(request.raw.url);
    const contextDAO = new ApplicationContextDAO(env.DB);
    return contextDAO.listDocumentsForUser(this.getAuthenticatedUserEmailAddress(cxt), {
      applicationId: url.searchParams.get('applicationId') || undefined,
      status: (url.searchParams.get('status') || undefined) as ApplicationContextDocumentStatus | undefined,
      cursor: url.searchParams.get('cursor') || undefined,
    });
  }
}

type ListApplicationContextDocumentsRequest = IRequest;

interface ListApplicationContextDocumentsResponse extends IResponse {
  documents: ApplicationContextDocument[];
  nextCursor?: string | undefined;
}

type ListApplicationContextDocumentsEnv = IUserEnv;

export { ListApplicationContextDocumentsRoute };
