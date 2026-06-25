import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { WatchService } from '@mail-otter/backend-services/subscription';

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
    await new WatchService(env).stopApplicationWatch(this.getAuthenticatedUserEmailAddress(cxt), request.applicationId);
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
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { StopApplicationWatchRoute };
