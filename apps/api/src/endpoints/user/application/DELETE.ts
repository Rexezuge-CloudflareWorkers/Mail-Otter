import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';

class DeleteApplicationRoute extends IUserRoute<DeleteApplicationRequest, DeleteApplicationResponse, DeleteApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Delete connected application',
    responses: {
      '200': {
        description: 'Application deleted',
      },
    },
  };

  protected async handleRequest(
    request: DeleteApplicationRequest,
    env: DeleteApplicationEnv,
    cxt: RouteContext<DeleteApplicationEnv>,
  ): Promise<DeleteApplicationResponse> {
    await ApplicationService.deleteUserApplication(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, env);
    return { success: true };
  }
}

interface DeleteApplicationRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationResponse extends IResponse {
  success: boolean;
}

interface DeleteApplicationEnv extends IUserEnv {
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
}

export { DeleteApplicationRoute };
