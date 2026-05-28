import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';

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
    return {
      email: this.getAuthenticatedUserEmailAddress(cxt),
      limits: {
        maxApplicationsPerUser: ConfigurationManager.getMaxApplicationsPerUser(env),
      },
    };
  }
}

type GetCurrentUserRequest = IRequest;

interface GetCurrentUserResponse extends IResponse {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
  };
}

interface GetCurrentUserEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

export { GetCurrentUserRoute };
