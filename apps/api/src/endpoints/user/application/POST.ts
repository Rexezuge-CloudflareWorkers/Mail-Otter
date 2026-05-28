import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';

class CreateApplicationRoute extends IUserRoute<CreateApplicationRequest, CreateApplicationResponse, CreateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Create connected mailbox application',
    responses: {
      '200': {
        description: 'Application created',
      },
    },
  };

  protected async handleRequest(
    request: CreateApplicationRequest,
    env: CreateApplicationEnv,
    cxt: RouteContext<CreateApplicationEnv>,
  ): Promise<CreateApplicationResponse> {
    return {
      application: await ApplicationService.createUserApplication(this.getAuthenticatedUserEmailAddress(cxt), request, env, request.raw),
    };
  }
}

interface CreateApplicationRequest extends IRequest {
  displayName: string;
  providerId: 'google-gmail' | 'microsoft-outlook';
  connectionMethod: 'oauth2';
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName?: string | undefined;
}

interface CreateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

interface CreateApplicationEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

export { CreateApplicationRoute };
