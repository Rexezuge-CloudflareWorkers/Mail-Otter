import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import type { ApplicationResponse } from '@mail-otter/backend-services/application';

class UpdateApplicationWatchSettingsRoute extends IUserRoute<
  UpdateApplicationWatchSettingsRequest,
  UpdateApplicationWatchSettingsResponse,
  UpdateApplicationWatchSettingsEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Update watched folder IDs for a connected application',
    responses: {
      '200': {
        description: 'Application watch settings updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationWatchSettingsRequest,
    env: UpdateApplicationWatchSettingsEnv,
    cxt: RouteContext<UpdateApplicationWatchSettingsEnv>,
  ): Promise<UpdateApplicationWatchSettingsResponse> {
    return {
      application: await ApplicationService.updateWatchedFolderIds(this.getAuthenticatedUserEmailAddress(cxt), request, env, request.raw),
    };
  }
}

interface UpdateApplicationWatchSettingsRequest extends IRequest {
  applicationId: string;
  folderIds: string[] | null;
  folderNames?: Record<string, string>;
}

interface UpdateApplicationWatchSettingsResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationWatchSettingsEnv = IUserEnv;

export { UpdateApplicationWatchSettingsRoute };
