import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { DEFAULT_MAX_APPLICATIONS_PER_USER } from '@mail-otter/shared/constants';
import { ConfigurationUtil } from '@/utils';

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
        maxApplicationsPerUser: ConfigurationUtil.getPositiveInteger(env.MAX_APPLICATIONS_PER_USER, DEFAULT_MAX_APPLICATIONS_PER_USER),
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
