import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { DigestConfigService } from '@mail-otter/backend-services/digest';
import type { DigestConfig } from '@mail-otter/shared/model';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

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
    const scope = createRequestScope(env);
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();

    // Throws NotFoundError for foreign/missing applications (was silently ignored).
    await scope.get(Tokens.ApplicationService).getOwnedApplication(userEmail, request.applicationId);

    const configSvc = DigestConfigService.forDatabase(env.DB, masterKey);
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
