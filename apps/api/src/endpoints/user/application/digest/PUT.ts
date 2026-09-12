import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import { DigestConfigService } from '@mail-otter/backend-services/digest';
import type { DigestConfig } from '@mail-otter/shared/model';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class UpdateDigestConfigRoute extends IUserRoute<UpdateDigestConfigRequest, UpdateDigestConfigResponse, UpdateDigestConfigEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Update digest configuration for a connected application',
    responses: {
      '200': {
        description: 'Digest configuration updated',
      },
    },
  };

  protected async handleRequest(
    request: UpdateDigestConfigRequest,
    env: UpdateDigestConfigEnv,
    cxt: RouteContext<UpdateDigestConfigEnv>,
  ): Promise<UpdateDigestConfigResponse> {
    const scope = createRequestScope(env);
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();

    await scope.get(Tokens.ApplicationService).getOwnedApplication(userEmail, request.applicationId);

    const configSvc = DigestConfigService.forDatabase(env.DB, masterKey);
    await configSvc.saveConfig(request.applicationId, {
      enabled: request.enabled,
      sendTime: request.sendTime,
      sections: request.sections,
    });
    const config = await configSvc.getConfig(request.applicationId);
    return { digestConfig: config };
  }
}

interface UpdateDigestConfigRequest extends IRequest {
  applicationId: string;
  enabled: boolean;
  sendTime: string;
  sections: string[];
}

interface UpdateDigestConfigResponse extends IResponse {
  digestConfig: DigestConfig;
}

type UpdateDigestConfigEnv = IUserEnv;

export { UpdateDigestConfigRoute };
