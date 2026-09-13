import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { OutboundIntegration } from '@mail-otter/shared/model';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class ListIntegrationsRoute extends IUserRoute<ListIntegrationsRequest, ListIntegrationsResponse, ListIntegrationsEnv> {
  schema = {
    tags: ['Integrations'],
    summary: 'List outbound integrations for a mailbox',
    responses: {
      '200': {
        description: 'Integration list',
      },
    },
  };

  protected async handleRequest(
    request: ListIntegrationsRequest,
    env: ListIntegrationsEnv,
    cxt: RouteContext<ListIntegrationsEnv>,
  ): Promise<ListIntegrationsResponse> {
    const scope = createRequestScope(env);
    const integrations = await scope.get(Tokens.ApplicationService).listIntegrations(this.getAuthenticatedUserEmailAddress(cxt), this.getQueryParam(request, 'applicationId') ?? '');
    return { integrations };
  }
}

type ListIntegrationsRequest = IRequest;

interface ListIntegrationsResponse extends IResponse {
  integrations: OutboundIntegration[];
}

type ListIntegrationsEnv = IUserEnv;

export { ListIntegrationsRoute };
