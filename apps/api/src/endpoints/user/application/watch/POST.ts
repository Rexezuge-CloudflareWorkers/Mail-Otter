import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { BaseUrlUtil } from '@mail-otter/shared/utils';
import { WatchService } from '@mail-otter/backend-services/subscription';

class StartApplicationWatchRoute extends IUserRoute<StartApplicationWatchRequest, StartApplicationWatchResponse, StartApplicationWatchEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Start provider push notifications',
    responses: {
      '200': {
        description: 'Watch started',
      },
    },
  };

  protected async handleRequest(
    request: StartApplicationWatchRequest,
    env: StartApplicationWatchEnv,
    cxt: RouteContext<StartApplicationWatchEnv>,
  ): Promise<StartApplicationWatchResponse> {
    return new WatchService(env).startApplicationWatch(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId, BaseUrlUtil.getBaseUrl(request.raw));
  }
}

interface StartApplicationWatchRequest extends IRequest {
  applicationId: string;
}

interface StartApplicationWatchResponse extends IResponse {
  message: string;
  webhookUrl: string;
  watchStatus: string;
  watchExpiresAt?: number;
}

interface StartApplicationWatchEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OUTLOOK_SUBSCRIPTION_TTL_DAYS?: string;
}

export { StartApplicationWatchRoute };
