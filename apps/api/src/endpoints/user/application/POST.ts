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
      application: await new ApplicationService(env).createUserApplication(this.getAuthenticatedUserEmailAddress(cxt), request, request.raw),
    };
  }
}

interface CreateApplicationRequest extends IRequest {
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
}

interface CreateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

interface CreateApplicationEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string;
}

export { CreateApplicationRoute };
