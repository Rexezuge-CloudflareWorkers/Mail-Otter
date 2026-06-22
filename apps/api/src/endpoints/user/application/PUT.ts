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
  providerId: 'google-gmail' | 'microsoft-outlook' | 'fastmail-jmap' | 'yahoo-mail' | 'custom-imap' | 'apple-icloud';
  connectionMethod: 'oauth2' | 'imap-password';
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  gmailPubsubTopicName?: string | undefined;
  imapHost?: string | undefined;
  imapPort?: number | undefined;
  imapUsername?: string | undefined;
  imapPassword?: string | undefined;
  smtpHost?: string | undefined;
  smtpPort?: number | undefined;
  enabledFeatures?: string[] | undefined;
  timeZone?: string | undefined;
  senderDomainFilters?: SenderDomainFilters | null | undefined;
}

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
