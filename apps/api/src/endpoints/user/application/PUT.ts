import { CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';
import type { SenderDomainFilters } from '@mail-otter/shared/model';

class UpdateApplicationRoute extends IUserRoute<UpdateApplicationRequest, UpdateApplicationResponse, UpdateApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected mailbox application',
    responses: {
      '200': {
        description: 'Application updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationRequest,
    env: UpdateApplicationEnv,
    cxt: RouteContext<UpdateApplicationEnv>,
  ): Promise<UpdateApplicationResponse> {
    return {
      application: await ApplicationService.updateUserApplication(this.getAuthenticatedUserEmailAddress(cxt), request, env, request.raw),
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
  displayName: string;
  providerId: 'google-gmail' | 'microsoft-outlook';
  connectionMethod: typeof CONNECTION_METHOD_OAUTH2;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  gmailPubsubTopicName?: string | undefined;
  enabledFeatures?: string[] | undefined;
  senderDomainFilters?: SenderDomainFilters | null | undefined;
}

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
