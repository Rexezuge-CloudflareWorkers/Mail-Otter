import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';

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
        maxContextDocumentsPerApplication: ConfigurationManager.getMaxContextDocumentsPerApplication(env),
      },
    };
  }
}

type GetCurrentUserRequest = IRequest;

interface GetCurrentUserResponse extends IResponse {
  email: string;
  limits: {
    maxApplicationsPerUser: number;
    maxContextDocumentsPerApplication: number;
  };
}

interface GetCurrentUserEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
  MAX_CONTEXT_DOCUMENTS_PER_APPLICATION?: string | undefined;
}

export { GetCurrentUserRoute };
