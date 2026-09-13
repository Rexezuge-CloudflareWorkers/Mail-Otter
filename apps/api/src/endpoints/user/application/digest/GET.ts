import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
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
    // Query-param read with body fallback: GETs carry `?applicationId=`
    // (see `DigestConfigQuerySchema`); unit callers historically passed it in
    // the request object. Matches `GetApplicationRulesRoute` pattern.
    const applicationId = this.getQueryParam(request, 'applicationId') ?? request.applicationId ?? '';

    // Throws NotFoundError for foreign/missing applications (was silently ignored).
    await scope.get(Tokens.ApplicationService).getOwnedApplication(userEmail, applicationId);

    const config = await scope.get(Tokens.DigestConfigService).getConfig(applicationId);
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
