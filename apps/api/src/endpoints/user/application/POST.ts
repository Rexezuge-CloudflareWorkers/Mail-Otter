import { CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_OAUTH2, DEFAULT_MAX_APPLICATIONS_PER_USER } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationCredentials, ConnectedApplicationMetadata, ProcessedMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { BaseUrlUtil, ConfigurationUtil } from '@/utils';

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
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const maxApplications: number = ConfigurationUtil.getPositiveInteger(env.MAX_APPLICATIONS_PER_USER, DEFAULT_MAX_APPLICATIONS_PER_USER);
    if ((await dao.countByUserEmail(userEmail)) >= maxApplications) {
      throw new BadRequestError(`Maximum ${maxApplications} connected applications allowed per user.`);
    }

    const credentials: ConnectedApplicationCredentials = {
      clientId: request.clientId,
      clientSecret: request.clientSecret,
    };
    const application: ConnectedApplicationMetadata = await dao.create(
      userEmail,
      request.displayName,
      request.providerId,
      CONNECTION_METHOD_OAUTH2,
      credentials,
      CONNECTED_APPLICATION_STATUS_DRAFT,
      request.gmailPubsubTopicName || null,
    );
    return {
      application: await this.decorateApplication(application, env, request.raw),
    };
  }

  private async decorateApplication(
    application: ConnectedApplicationMetadata,
    env: CreateApplicationEnv,
    raw: Request,
  ): Promise<ApplicationResponse> {
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const processedMessageDAO = new ProcessedMessageDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    const latestMessage: ProcessedMessage | undefined = await processedMessageDAO.getLatestForApplication(application.applicationId);
    const baseUrl: string = BaseUrlUtil.getBaseUrl(raw);
    return {
      ...application,
      oauth2RedirectUri: `${baseUrl}/api/oauth2/callback/${application.applicationId}`,
      webhookUrl: `${baseUrl}/api/webhooks/${application.providerId === 'google-gmail' ? 'gmail' : 'outlook'}/${application.applicationId}${
        subscription?.webhookSecretHash ? '?token=shown-on-watch-start' : ''
      }`,
      watchStatus: subscription?.status,
      watchExpiresAt: subscription?.expiresAt,
      lastSummaryAt: latestMessage?.summarySentAt,
      lastError: subscription?.lastError || latestMessage?.errorMessage,
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

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface CreateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

interface CreateApplicationEnv extends IUserEnv {
  MAX_APPLICATIONS_PER_USER?: string | undefined;
}

export { CreateApplicationRoute };
