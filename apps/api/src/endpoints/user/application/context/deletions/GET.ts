import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationContextDeletionRun } from '@mail-otter/shared/model';
import { ContextService } from '@mail-otter/backend-services/email';

class ListApplicationContextDeletionRunsRoute extends IUserRoute<
  ListApplicationContextDeletionRunsRequest,
  ListApplicationContextDeletionRunsResponse,
  ListApplicationContextDeletionRunsEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'List context deletion history for the authenticated user',
    responses: {
      '200': {
        description: 'Application context deletion runs',
      },
    },
  };

  protected async handleRequest(
    request: ListApplicationContextDeletionRunsRequest,
    env: ListApplicationContextDeletionRunsEnv,
    cxt: RouteContext<ListApplicationContextDeletionRunsEnv>,
  ): Promise<ListApplicationContextDeletionRunsResponse> {
    return new ContextService(env).listDeletionRuns(this.getAuthenticatedUserEmailAddress(cxt), { applicationId: this.getQueryParam(request, 'applicationId'), cursor: this.getQueryParam(request, 'cursor') });
  }
}

type ListApplicationContextDeletionRunsRequest = IRequest;

interface ListApplicationContextDeletionRunsResponse extends IResponse {
  deletionRuns: ApplicationContextDeletionRun[];
  nextCursor?: string;
}

type ListApplicationContextDeletionRunsEnv = IUserEnv;

export { ListApplicationContextDeletionRunsRoute };
