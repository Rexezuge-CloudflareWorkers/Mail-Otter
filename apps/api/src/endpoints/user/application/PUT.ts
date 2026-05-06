import { CONNECTED_APPLICATION_STATUS_DRAFT, CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type {
  ConnectedApplicationCredentials,
  ConnectedApplicationMetadata,
  OAuth2Credentials,
  ProcessedMessage,
  ProviderSubscription,
} from '@mail-otter/shared/model';
import { BaseUrlUtil } from '@/utils';

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
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const existing = await dao.getByIdForUser(request.applicationId, userEmail);
    if (!existing) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (existing.providerId !== request.providerId || existing.connectionMethod !== request.connectionMethod) {
      throw new BadRequestError('Provider and connection method cannot be changed after creation.');
    }

    const credentials: ConnectedApplicationCredentials = {
      clientId: request.clientId,
      clientSecret: request.clientSecret,
      refreshToken: (existing.credentials as OAuth2Credentials).refreshToken,
    };
    const application: ConnectedApplicationMetadata | undefined = await dao.updateForUser(
      request.applicationId,
      userEmail,
      request.displayName,
      credentials,
      CONNECTED_APPLICATION_STATUS_DRAFT,
      request.gmailPubsubTopicName || null,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return {
      application: await this.decorateApplication(application, env, request.raw),
    };
  }

  private async decorateApplication(
    application: ConnectedApplicationMetadata,
    env: UpdateApplicationEnv,
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
      webhookUrl: `${baseUrl}/api/webhooks/${application.providerId === 'google-gmail' ? 'gmail' : 'outlook'}/${application.applicationId}`,
      watchStatus: subscription?.status,
      watchExpiresAt: subscription?.expiresAt,
      lastSummaryAt: latestMessage?.summarySentAt,
      lastError: subscription?.lastError || latestMessage?.errorMessage,
    };
  }
}

interface UpdateApplicationRequest extends IRequest {
  applicationId: string;
  displayName: string;
  providerId: 'google-gmail' | 'microsoft-outlook';
  connectionMethod: typeof CONNECTION_METHOD_OAUTH2;
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName?: string | undefined;
}

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface UpdateApplicationResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationEnv = IUserEnv;

export { UpdateApplicationRoute };
