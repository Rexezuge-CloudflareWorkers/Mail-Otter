import { ConnectedApplicationDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-otter/shared/model';
import { ApplicationResponseUtil } from '@/utils';
import type { ApplicationResponse } from '@/utils';

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
    const applications: ConnectedApplicationMetadata[] = await dao.listMetadataByUserEmail(this.getAuthenticatedUserEmailAddress(cxt));
    return {
      applications: await Promise.all(
        applications.map(async (application: ConnectedApplicationMetadata): Promise<ApplicationResponse> => {
          return ApplicationResponseUtil.decorateApplication(application, env, request.raw);
        }),
      ),
    };
  }
}

type ListApplicationsRequest = IRequest;

interface ListApplicationsResponse extends IResponse {
  applications: ApplicationResponse[];
}

type ListApplicationsEnv = IUserEnv;

export { ListApplicationsRoute };
