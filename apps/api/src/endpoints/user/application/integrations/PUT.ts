import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { OutboundIntegration } from '@mail-otter/shared/model';

class UpdateIntegrationRoute extends IUserRoute<UpdateIntegrationRequest, UpdateIntegrationResponse, UpdateIntegrationEnv> {
  schema = {
    tags: ['Integrations'],
    summary: 'Update an outbound integration',
    responses: {
      '200': {
        description: 'Integration updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateIntegrationRequest,
    env: UpdateIntegrationEnv,
    cxt: RouteContext<UpdateIntegrationEnv>,
  ): Promise<UpdateIntegrationResponse> {
    const integration = await ApplicationService.updateIntegration(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        integrationId: request.integrationId,
        name: request.name,
        enabled: request.enabled,
        webhookUrl: request.webhookUrl,
      },
      env,
    );
    return { integration };
  }
}

interface UpdateIntegrationRequest extends IRequest {
  integrationId: string;
  name?: string | undefined;
  enabled?: boolean | undefined;
  webhookUrl?: string | undefined;
}

interface UpdateIntegrationResponse extends IResponse {
  integration: OutboundIntegration;
}

type UpdateIntegrationEnv = IUserEnv;

export { UpdateIntegrationRoute };
