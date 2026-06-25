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
      application: await new ApplicationService(env).updateUserApplication(this.getAuthenticatedUserEmailAddress(cxt), request, request.raw),
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
  displayName: string;
  providerId: 'google-gmail' | 'microsoft-outlook' | 'fastmail-jmap' | 'yahoo-mail' | 'custom-imap' | 'apple-icloud';
  connectionMethod: 'oauth2' | 'imap-password';
  clientId?: string;
  clientSecret?: string;
  gmailPubsubTopicName?: string;
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
  imapPassword?: string;
  smtpHost?: string;
  smtpPort?: number;
  enabledFeatures?: string[];
  timeZone?: string;
  senderDomainFilters?: SenderDomainFilters | null;
  autoExecuteActionTypes?: string[] | null;
}

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
