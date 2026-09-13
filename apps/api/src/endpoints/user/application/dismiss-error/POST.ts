import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class DismissApplicationErrorRoute extends IUserRoute<
  DismissApplicationErrorRequest,
  DismissApplicationErrorResponse,
  IUserEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Acknowledge and dismiss a processing or context error',
    responses: {
      '200': {
        description: 'Error acknowledged',
      },
    },
  };

  protected async handleRequest(
    request: DismissApplicationErrorRequest,
    env: IUserEnv,
    cxt: RouteContext<IUserEnv>,
  ): Promise<DismissApplicationErrorResponse> {
    const scope = createRequestScope(env);
    return {
      application: await scope.get(Tokens.ApplicationService).acknowledgeApplicationError(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, request.errorType, request.raw),
    };
  }
}

interface DismissApplicationErrorRequest extends IRequest {
  applicationId: string;
  errorType: 'processing' | 'context';
}

interface DismissApplicationErrorResponse extends IResponse {
  application: ApplicationResponse;
}

export { DismissApplicationErrorRoute };
