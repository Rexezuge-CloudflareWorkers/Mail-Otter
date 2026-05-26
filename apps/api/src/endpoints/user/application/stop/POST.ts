import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@mail-otter/backend-core/dao';
import { BadRequestError } from '@mail-otter/backend-core/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplication, ProviderSubscription } from '@mail-otter/shared/model';
import { GmailProviderUtil, OAuth2AccessTokenService, OutlookProviderUtil } from '@mail-otter/backend-core/utils';

class StopApplicationWatchRoute extends IUserRoute<StopApplicationWatchRequest, StopApplicationWatchResponse, StopApplicationWatchEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Stop provider push notifications',
    responses: {
      '200': {
        description: 'Watch stopped',
      },
    },
  };

  protected async handleRequest(
    request: StopApplicationWatchRequest,
    env: StopApplicationWatchEnv,
    cxt: RouteContext<StopApplicationWatchEnv>,
  ): Promise<StopApplicationWatchResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) throw new BadRequestError('Connected application was not found.');

    const subscriptionDAO = new ProviderSubscriptionDAO(env.DB);
    const subscription: ProviderSubscription | undefined = await subscriptionDAO.getByApplication(application.applicationId);
    const accessToken: string = await OAuth2AccessTokenService.getAccessToken(application.applicationId, env);
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      await GmailProviderUtil.stopWatch(accessToken);
    } else if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK && subscription?.externalSubscriptionId) {
      await OutlookProviderUtil.deleteSubscription(accessToken, subscription.externalSubscriptionId);
    }
    await subscriptionDAO.markStopped(application.applicationId);
    return { message: 'Provider notifications stopped.' };
  }
}

interface StopApplicationWatchRequest extends IRequest {
  applicationId: string;
}

interface StopApplicationWatchResponse extends IResponse {
  message: string;
}

interface StopApplicationWatchEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { StopApplicationWatchRoute };
