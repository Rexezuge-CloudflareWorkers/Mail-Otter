import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { OutboundIntegration, OutboundIntegrationType } from '@mail-otter/shared/model';

class CreateIntegrationRoute extends IUserRoute<CreateIntegrationRequest, CreateIntegrationResponse, CreateIntegrationEnv> {
  schema = {
    tags: ['Integrations'],
    summary: 'Create an outbound integration for a mailbox',
    responses: {
      '200': {
        description: 'Integration created',
      },
    },
  };

  protected async handleRequest(
    request: CreateIntegrationRequest,
    env: CreateIntegrationEnv,
    cxt: RouteContext<CreateIntegrationEnv>,
  ): Promise<CreateIntegrationResponse> {
    const integration = await ApplicationService.createIntegration(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        applicationId: request.applicationId,
        integrationType: request.integrationType,
        name: request.name,
        webhookUrl: request.webhookUrl,
      },
      env,
    );
    return { integration };
  }
}

interface CreateIntegrationRequest extends IRequest {
  applicationId: string;
  integrationType: OutboundIntegrationType;
  name: string;
  webhookUrl: string;
}

interface CreateIntegrationResponse extends IResponse {
  integration: OutboundIntegration;
}

type CreateIntegrationEnv = IUserEnv;

export { CreateIntegrationRoute };
