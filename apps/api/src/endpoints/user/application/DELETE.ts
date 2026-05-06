import { ConnectedApplicationDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';

class DeleteApplicationRoute extends IUserRoute<DeleteApplicationRequest, DeleteApplicationResponse, DeleteApplicationEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Delete connected application',
    responses: {
      '200': {
        description: 'Application deleted',
      },
    },
  };

  protected async handleRequest(
    request: DeleteApplicationRequest,
    env: DeleteApplicationEnv,
    cxt: RouteContext<DeleteApplicationEnv>,
  ): Promise<DeleteApplicationResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    await dao.deleteForUser(request.applicationId, this.getAuthenticatedUserEmailAddress(cxt));
    return { success: true };
  }
}

interface DeleteApplicationRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationResponse extends IResponse {
  success: boolean;
}

type DeleteApplicationEnv = IUserEnv;

export { DeleteApplicationRoute };
