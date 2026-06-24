import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';

class GetApplicationLabelsRoute extends IUserRoute<GetApplicationLabelsRequest, GetApplicationLabelsResponse, GetApplicationLabelsEnv> {
  schema = {
    tags: ['Rules'],
    summary: 'List provider labels for a mailbox',
    responses: {
      '200': {
        description: 'Labels list',
      },
    },
  };

  protected async handleRequest(
    request: GetApplicationLabelsRequest,
    env: GetApplicationLabelsEnv,
    cxt: RouteContext<GetApplicationLabelsEnv>,
  ): Promise<GetApplicationLabelsResponse> {
    const applicationId = this.getQueryParam(request, 'applicationId') ?? '';
    const labels = await new ApplicationService(env).listLabels(this.getAuthenticatedUserEmailAddress(cxt), applicationId);
    return { labels };
  }
}

type GetApplicationLabelsRequest = IRequest;

interface GetApplicationLabelsResponse extends IResponse {
  labels: Array<{ id: string; name: string }>;
}

type GetApplicationLabelsEnv = IUserEnv;

export { GetApplicationLabelsRoute };
