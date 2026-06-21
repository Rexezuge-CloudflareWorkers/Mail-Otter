import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';

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
    return {
      application: await ApplicationService.acknowledgeApplicationError(
        this.getAuthenticatedUserEmailAddress(cxt),
        request.applicationId,
        request.errorType,
        env,
        request.raw,
      ),
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
