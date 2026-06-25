import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { FolderService } from '@mail-otter/backend-services/application';
import type { ProviderFolder } from '@mail-otter/backend-services/application';

class GetApplicationFoldersRoute extends IUserRoute<GetApplicationFoldersRequest, GetApplicationFoldersResponse, GetApplicationFoldersEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'List available folders/labels from the connected provider',
    responses: {
      '200': {
        description: 'Provider folders',
      },
    },
  };

  protected async handleRequest(
    request: GetApplicationFoldersRequest,
    env: GetApplicationFoldersEnv,
    cxt: RouteContext<GetApplicationFoldersEnv>,
  ): Promise<GetApplicationFoldersResponse> {
    const applicationId = this.getQueryParam(request, 'applicationId') ?? '';
    const folders = await new FolderService(env).listFolders(this.getAuthenticatedUserEmailAddress(cxt), applicationId);
    return { folders };
  }
}

type GetApplicationFoldersRequest = IRequest;

interface GetApplicationFoldersResponse extends IResponse {
  folders: ProviderFolder[];
}

interface GetApplicationFoldersEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { GetApplicationFoldersRoute };
