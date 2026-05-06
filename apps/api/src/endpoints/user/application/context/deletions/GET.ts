import { ApplicationContextDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationContextDeletionRun } from '@mail-otter/shared/model';

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
    const url = new URL(request.raw.url);
    const contextDAO = new ApplicationContextDAO(env.DB);
    return contextDAO.listDeletionRunsForUser(this.getAuthenticatedUserEmailAddress(cxt), {
      applicationId: url.searchParams.get('applicationId') || undefined,
      cursor: url.searchParams.get('cursor') || undefined,
    });
  }
}

type ListApplicationContextDeletionRunsRequest = IRequest;

interface ListApplicationContextDeletionRunsResponse extends IResponse {
  deletionRuns: ApplicationContextDeletionRun[];
  nextCursor?: string | undefined;
}

type ListApplicationContextDeletionRunsEnv = IUserEnv;

export { ListApplicationContextDeletionRunsRoute };
