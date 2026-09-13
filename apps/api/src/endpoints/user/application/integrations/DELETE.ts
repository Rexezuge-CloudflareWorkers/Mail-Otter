import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class DeleteIntegrationRoute extends IUserRoute<DeleteIntegrationRequest, DeleteIntegrationResponse, DeleteIntegrationEnv> {
  schema = {
    tags: ['Integrations'],
    summary: 'Delete an outbound integration',
    responses: {
      '200': {
        description: 'Integration deleted',
      },
    },
  };

  protected async handleRequest(
    request: DeleteIntegrationRequest,
    env: DeleteIntegrationEnv,
    cxt: RouteContext<DeleteIntegrationEnv>,
  ): Promise<DeleteIntegrationResponse> {
    const scope = createRequestScope(env);
    await scope.get(Tokens.ApplicationService).deleteIntegration(this.getAuthenticatedUserEmailAddress(cxt), request.integrationId);
    return { success: true };
  }
}

interface DeleteIntegrationRequest extends IRequest {
  integrationId: string;
}

interface DeleteIntegrationResponse extends IResponse {
  success: boolean;
}

type DeleteIntegrationEnv = IUserEnv;

export { DeleteIntegrationRoute };
