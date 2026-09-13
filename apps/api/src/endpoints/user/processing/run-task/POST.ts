import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class RunTaskNowRoute extends IUserRoute<RunTaskNowRequest, RunTaskNowResponse, RunTaskNowEnv> {
  schema = {
    tags: ['Processing'],
    summary: 'Manually trigger a user-level scheduled task for a connected application',
    responses: {
      '200': {
        description: 'Task triggered',
      },
    },
  };

  protected async handleRequest(
    request: RunTaskNowRequest,
    env: RunTaskNowEnv,
    cxt: RouteContext<RunTaskNowEnv>,
  ): Promise<RunTaskNowResponse> {
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const scope = createRequestScope(env);
    await scope.get(Tokens.ProcessingService).triggerTask(userEmail, request.taskType, request.applicationId, env);
    return { triggered: true };
  }
}

interface RunTaskNowRequest extends IRequest {
  taskType: string;
  applicationId: string;
}

interface RunTaskNowResponse extends IResponse {
  triggered: boolean;
}

interface RunTaskNowEnv extends IUserEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  PACKAGE_TRACKING_API_KEY?: string;
  FLIGHT_TRACKING_API_KEY?: string;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { RunTaskNowRoute };
