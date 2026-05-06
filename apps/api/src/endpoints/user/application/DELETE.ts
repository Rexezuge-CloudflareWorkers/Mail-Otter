import { ApplicationContextDAO, ConnectedApplicationDAO } from '@/dao';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { EmailContextUtil } from '@/utils';

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
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const contextDAO = new ApplicationContextDAO(env.DB);
    const vectorIds: string[] = await contextDAO.listActiveVectorIdsForApplication(request.applicationId, userEmail);
    if (env.EMAIL_CONTEXT_INDEX) {
      for (const chunk of EmailContextUtil.chunk(vectorIds, 1000)) {
        if (chunk.length > 0) await env.EMAIL_CONTEXT_INDEX.deleteByIds(chunk);
      }
      await contextDAO.markDocumentsDeletedByVectorIds(request.applicationId, userEmail, vectorIds);
    }
    await dao.deleteForUser(request.applicationId, userEmail);
    return { success: true };
  }
}

interface DeleteApplicationRequest extends IRequest {
  applicationId: string;
}

interface DeleteApplicationResponse extends IResponse {
  success: boolean;
}

interface DeleteApplicationEnv extends IUserEnv {
  EMAIL_CONTEXT_INDEX?: Vectorize | undefined;
}

export { DeleteApplicationRoute };
