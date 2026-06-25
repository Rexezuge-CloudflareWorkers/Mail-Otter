import { BadRequestError } from '@mail-otter/backend-errors';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import { OAuth2AuthorizationService } from '@mail-otter/backend-services/oauth2';

class OAuth2CallbackRoute extends IBaseRoute<OAuth2CallbackRequest, OAuth2CallbackResponse, OAuth2CallbackEnv> {
  schema = {
    tags: ['OAuth2'],
    summary: 'OAuth2 provider callback',
    responses: {
      '302': {
        description: 'Redirects to the user UI after callback processing',
      },
    },
  };

  protected async handleRequest(
    request: OAuth2CallbackRequest,
    env: OAuth2CallbackEnv,
    cxt: RouteContext<OAuth2CallbackEnv>,
  ): Promise<ExtendedResponse<OAuth2CallbackResponse>> {
    const applicationId: string | undefined = cxt.req.param('applicationId');
    if (!applicationId) {
      throw new BadRequestError('OAuth2 callback is missing applicationId.');
    }
    const error = this.getQueryParam(request, 'error');
    if (error) {
      return this.redirect(`/user/?oauth2=error&message=${encodeURIComponent(error)}`);
    }
    const code = this.getQueryParam(request, 'code') ?? null;
    const state = this.getQueryParam(request, 'state') ?? null;
    if (!code || !state) {
      throw new BadRequestError('OAuth2 callback is missing code or state.');
    }

    try {
      await new OAuth2AuthorizationService(env).completeCallback({ applicationId, code, state });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'OAuth2 authorization failed.';
      return this.redirect(`/user/?oauth2=error&message=${encodeURIComponent(message)}`);
    }
    return this.redirect(`/user/?oauth2=connected&applicationId=${encodeURIComponent(applicationId)}`);
  }

  private redirect(location: string): ExtendedResponse<OAuth2CallbackResponse> {
    return {
      statusCode: 302,
      headers: { Location: location },
    };
  }
}

type OAuth2CallbackRequest = IRequest;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface OAuth2CallbackResponse extends IResponse {}

interface OAuth2CallbackEnv extends IEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

export { OAuth2CallbackRoute };
