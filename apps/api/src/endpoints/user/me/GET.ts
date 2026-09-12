import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { UserService } from '@mail-otter/backend-services/user';
import type { UserServiceEnv } from '@mail-otter/backend-services/user';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class GetCurrentUserRoute extends IUserRoute<GetCurrentUserRequest, GetCurrentUserResponse, GetCurrentUserEnv> {
  schema = {
    tags: ['User'],
    summary: 'Get current user',
    responses: {
      '200': {
        description: 'Current user metadata',
      },
    },
  };

  protected async handleRequest(
    _request: GetCurrentUserRequest,
    env: GetCurrentUserEnv,
    cxt: RouteContext<GetCurrentUserEnv>,
  ): Promise<GetCurrentUserResponse> {
    const scope = createRequestScope(env);
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const summary = await scope.get(Tokens.UserService).getCurrentUserSummary(userEmail);
    return {
      email: userEmail,
      ...summary,
    };
  }
}

type GetCurrentUserRequest = IRequest;

interface GetCurrentUserResponse extends IResponse {
  email: string;
  preferredLanguage: string | null;
  limits: {
    maxApplicationsPerUser: number;
    maxContextDocumentsPerApplication: number;
  };
  aiUsage: {
    estimatedNeurons: number;
    dailyNeuronLimit: number;
    fallbackThreshold: number;
  };
}

interface GetCurrentUserEnv extends IUserEnv, UserServiceEnv {}

export { GetCurrentUserRoute };
