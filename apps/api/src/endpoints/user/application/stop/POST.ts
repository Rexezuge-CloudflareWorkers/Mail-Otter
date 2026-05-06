import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, ProviderSubscriptionDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplication, OAuth2Credentials, ProviderSubscription } from '@mail-otter/shared/model';
import { GmailProviderUtil, OAuth2ProviderUtil, OutlookProviderUtil } from '@/utils';

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
    const tokenResult = await OAuth2ProviderUtil.refreshAccessToken({
      providerId: application.providerId,
      credentials: application.credentials as OAuth2Credentials,
    });
    if (tokenResult.refreshToken) {
      await applicationDAO.updateOAuth2RefreshToken(application.applicationId, tokenResult.refreshToken);
    }
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      await GmailProviderUtil.stopWatch(tokenResult.accessToken);
    } else if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK && subscription?.externalSubscriptionId) {
      await OutlookProviderUtil.deleteSubscription(tokenResult.accessToken, subscription.externalSubscriptionId);
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

type StopApplicationWatchEnv = IUserEnv;

export { StopApplicationWatchRoute };
