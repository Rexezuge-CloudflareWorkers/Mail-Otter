import { ConnectedApplicationDAO, ProcessedMessageDAO, ProviderSubscriptionDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata, ProcessedMessage, ProviderSubscription } from '@mail-otter/shared/model';
import { BaseUrlUtil } from '@/utils';

class ListApplicationsRoute extends IUserRoute<ListApplicationsRequest, ListApplicationsResponse, ListApplicationsEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'List connected mailbox applications',
    responses: {
      '200': {
        description: 'Connected applications',
      },
    },
  };

  protected async handleRequest(
    request: ListApplicationsRequest,
    env: ListApplicationsEnv,
    cxt: RouteContext<ListApplicationsEnv>,
  ): Promise<ListApplicationsResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const processedMessageDAO = new ProcessedMessageDAO(env.DB);
    const applications: ConnectedApplicationMetadata[] = await dao.listMetadataByUserEmail(this.getAuthenticatedUserEmailAddress(cxt));
    const baseUrl: string = BaseUrlUtil.getBaseUrl(request.raw);
    return {
      applications: await Promise.all(
        applications.map(async (application: ConnectedApplicationMetadata): Promise<ApplicationResponse> => {
          const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
          const latestMessage: ProcessedMessage | undefined = await processedMessageDAO.getLatestForApplication(application.applicationId);
          return {
            ...application,
            oauth2RedirectUri: `${baseUrl}/api/oauth2/callback/${application.applicationId}`,
            webhookUrl: `${baseUrl}/api/webhooks/${application.providerId === 'google-gmail' ? 'gmail' : 'outlook'}/${application.applicationId}`,
            watchStatus: subscription?.status,
            watchExpiresAt: subscription?.expiresAt,
            lastSummaryAt: latestMessage?.summarySentAt,
            lastError: subscription?.lastError || latestMessage?.errorMessage,
          };
        }),
      ),
    };
  }
}

type ListApplicationsRequest = IRequest;

interface ApplicationResponse extends ConnectedApplicationMetadata {
  oauth2RedirectUri: string;
}

interface ListApplicationsResponse extends IResponse {
  applications: ApplicationResponse[];
}

type ListApplicationsEnv = IUserEnv;

export { ListApplicationsRoute };
