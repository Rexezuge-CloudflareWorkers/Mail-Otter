import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ApplicationService } from '@mail-otter/backend-services/application';
import { DigestService } from '@mail-otter/backend-services/digest';
import { OAuth2AccessTokenService } from '@mail-otter/backend-services/oauth2';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class SendDigestNowRoute extends IUserRoute<SendDigestNowRequest, SendDigestNowResponse, SendDigestNowEnv> {
  schema = {
    tags: ['Applications'],
    summary: 'Manually trigger digest email for a connected application',
    responses: {
      '200': {
        description: 'Digest sent',
      },
    },
  };

  protected async handleRequest(
    request: SendDigestNowRequest,
    env: SendDigestNowEnv,
    cxt: RouteContext<SendDigestNowEnv>,
  ): Promise<SendDigestNowResponse> {
    const scope = createRequestScope(env);
    const keys = await scope.get(Tokens.Keys)();
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);

    const application = await scope.get(Tokens.ApplicationService).getOwnedApplication(userEmail, request.applicationId);

    const accessToken = await scope.get(Tokens.OAuth2AccessTokenService).getAccessToken(request.applicationId);
    const digestSvc = new DigestService(env, keys.masterKey, keys.actionKey, { providerRegistry: scope.get(Tokens.ProviderRegistry) });

    await digestSvc.sendDigestForced(application, accessToken);
    return { sent: true };
  }
}

interface SendDigestNowRequest extends IRequest {
  applicationId: string;
}

interface SendDigestNowResponse extends IResponse {
  sent: boolean;
}

interface SendDigestNowEnv extends IUserEnv {
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  ACTION_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
}

export { SendDigestNowRoute };
