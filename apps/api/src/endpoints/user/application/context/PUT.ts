import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ContextService } from '@mail-otter/backend-services/email';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';

class UpdateApplicationContextRoute extends IUserRoute<
  UpdateApplicationContextRequest,
  UpdateApplicationContextResponse,
  UpdateApplicationContextEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected application context indexing setting',
    responses: {
      '200': {
        description: 'Application context setting updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationContextRequest,
    env: UpdateApplicationContextEnv,
    cxt: RouteContext<UpdateApplicationContextEnv>,
  ): Promise<UpdateApplicationContextResponse> {
    return {
      application: await ContextService.updateContextIndexing(this.getAuthenticatedUserEmailAddress(cxt), request, env, request.raw),
    };
  }
}

interface UpdateApplicationContextRequest extends IRequest {
  applicationId: string;
  contextIndexingEnabled: boolean;
}

interface UpdateApplicationContextResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationContextEnv = IUserEnv;

export { UpdateApplicationContextRoute };
