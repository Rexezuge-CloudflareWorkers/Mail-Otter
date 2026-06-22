import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { OutboundIntegration } from '@mail-otter/shared/model';

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
    const integrations = await ApplicationService.listIntegrations(
      this.getAuthenticatedUserEmailAddress(cxt),
      request.applicationId,
      env,
    );
    return { integrations };
  }
}

interface ListIntegrationsRequest extends IRequest {
  applicationId: string;
}

interface ListIntegrationsResponse extends IResponse {
  integrations: OutboundIntegration[];
}

type ListIntegrationsEnv = IUserEnv;

export { ListIntegrationsRoute };
