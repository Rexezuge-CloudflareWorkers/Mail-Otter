import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ProcessingService } from '@mail-otter/backend-services/processing';
import type { BackgroundTaskRun, BackgroundTaskRunStatus } from '@mail-otter/backend-data/dao';

class ListBackgroundTaskRunsRoute extends IUserRoute<ListBackgroundTaskRunsRequest, ListBackgroundTaskRunsResponse, ListBackgroundTaskRunsEnv> {
  schema = {
    tags: ['Processing'],
    summary: 'List background task runs for the authenticated user',
    responses: {
      '200': { description: 'Background task runs' },
    },
  };

  protected async handleRequest(
    request: ListBackgroundTaskRunsRequest,
    env: ListBackgroundTaskRunsEnv,
    cxt: RouteContext<ListBackgroundTaskRunsEnv>,
  ): Promise<ListBackgroundTaskRunsResponse> {
    return ProcessingService.listTaskRuns(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        taskType: this.getQueryParam(request, 'taskType'),
        applicationId: this.getQueryParam(request, 'applicationId'),
        status: this.getQueryParam(request, 'status') as BackgroundTaskRunStatus | undefined,
        cursor: this.getQueryParam(request, 'cursor'),
      },
      env,
    );
  }
}

type ListBackgroundTaskRunsRequest = IRequest;

interface ListBackgroundTaskRunsResponse extends IResponse {
  runs: BackgroundTaskRun[];
  nextCursor?: string;
}

type ListBackgroundTaskRunsEnv = IUserEnv;

export { ListBackgroundTaskRunsRoute };
