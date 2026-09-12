import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class TestIntegrationRoute extends IUserRoute<TestIntegrationRequest, TestIntegrationResponse, TestIntegrationEnv> {
  schema = {
    tags: ['Integrations'],
    summary: 'Send a test notification to an outbound integration',
    responses: {
      '200': {
        description: 'Test notification sent',
      },
    },
  };

  protected async handleRequest(
    request: TestIntegrationRequest,
    env: TestIntegrationEnv,
    cxt: RouteContext<TestIntegrationEnv>,
  ): Promise<TestIntegrationResponse> {
    const scope = createRequestScope(env);
    await scope.get(Tokens.ApplicationService).testIntegration(this.getAuthenticatedUserEmailAddress(cxt), request.integrationId);
    return { success: true };
  }
}

interface TestIntegrationRequest extends IRequest {
  integrationId: string;
}

interface TestIntegrationResponse extends IResponse {
  success: boolean;
}

type TestIntegrationEnv = IUserEnv;

export { TestIntegrationRoute };
