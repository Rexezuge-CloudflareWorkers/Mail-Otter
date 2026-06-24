import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ConnectedApplicationDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import { DigestConfigService } from '@mail-otter/backend-services/digest';
import type { DigestConfig } from '@mail-otter/shared/model';

class GetDigestConfigRoute extends IUserRoute<GetDigestConfigRequest, GetDigestConfigResponse, GetDigestConfigEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Get digest configuration for a connected application',
    responses: {
      '200': {
        description: 'Digest configuration',
      },
    },
  };

  protected async handleRequest(
    request: GetDigestConfigRequest,
    env: GetDigestConfigEnv,
    cxt: RouteContext<GetDigestConfigEnv>,
  ): Promise<GetDigestConfigResponse> {
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const sessionEnv = createD1SessionEnv(env);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);

    await applicationDAO.getByIdForUser(request.applicationId, userEmail);

    const configSvc = new DigestConfigService(applicationDAO);
    const config = await configSvc.getConfig(request.applicationId);
    return { digestConfig: config };
  }
}

interface GetDigestConfigRequest extends IRequest {
  applicationId: string;
}

interface GetDigestConfigResponse extends IResponse {
  digestConfig: DigestConfig;
}

type GetDigestConfigEnv = IUserEnv;

export { GetDigestConfigRoute };
