import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

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
    const scope = createRequestScope(env);
    const applicationId = this.getQueryParam(request, 'applicationId') ?? '';
    const labels = await scope.get(Tokens.ApplicationService).listLabels(this.getAuthenticatedUserEmailAddress(cxt), applicationId);
    return { labels };
  }
}

type GetApplicationLabelsRequest = IRequest;

interface GetApplicationLabelsResponse extends IResponse {
  labels: Array<{ id: string; name: string }>;
}

type GetApplicationLabelsEnv = IUserEnv;

export { GetApplicationLabelsRoute };
