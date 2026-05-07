import { ConnectedApplicationDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplicationMetadata } from '@mail-otter/shared/model';
import { ApplicationResponseUtil } from '@/utils';
import type { ApplicationResponse } from '@/utils';

class UpdateApplicationContextRoute extends IUserRoute<
  UpdateApplicationContextRequest,
  UpdateApplicationContextResponse,
  UpdateApplicationContextEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Update connected application context indexing setting',
    responses: {
      '200': {
        description: 'Application context setting updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateApplicationContextRequest,
    env: UpdateApplicationContextEnv,
    cxt: RouteContext<UpdateApplicationContextEnv>,
  ): Promise<UpdateApplicationContextResponse> {
    const userEmail: string = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const dao = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplicationMetadata | undefined = await dao.updateContextIndexingForUser(
      request.applicationId,
      userEmail,
      request.contextIndexingEnabled,
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    return {
      application: await ApplicationResponseUtil.decorateApplication(application, env, request.raw),
    };
  }
}

interface UpdateApplicationContextRequest extends IRequest {
  applicationId: string;
  contextIndexingEnabled: boolean;
}

interface UpdateApplicationContextResponse extends IResponse {
  application: ApplicationResponse;
}

type UpdateApplicationContextEnv = IUserEnv;

export { UpdateApplicationContextRoute };
