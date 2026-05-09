import { ConnectedApplicationDAO, OAuth2AuthorizationSessionDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IBaseRoute } from '@/endpoints/IBaseRoute';
import type { ExtendedResponse, IEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IBaseRoute';
import type { ConnectedApplication, OAuth2AuthorizationSession } from '@mail-otter/shared/model';
import { OAuth2AccessTokenService, OAuth2StateUtil } from '@/utils';

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
    const url: URL = new URL(request.raw.url);
    const error: string | null = url.searchParams.get('error');
    if (error) {
      return this.redirect(`/user?oauth2=error&message=${encodeURIComponent(error)}`);
    }
    const code: string | null = url.searchParams.get('code');
    const state: string | null = url.searchParams.get('state');
    if (!code || !state) {
      throw new BadRequestError('OAuth2 callback is missing code or state.');
    }

    const stateHash: string = await OAuth2StateUtil.getStateHash(state);
    const sessionDAO: OAuth2AuthorizationSessionDAO = new OAuth2AuthorizationSessionDAO(env.DB);
    const session: OAuth2AuthorizationSession | undefined = await sessionDAO.getActive(applicationId, stateHash);
    if (!session) {
      throw new BadRequestError('OAuth2 authorization session is invalid or expired.');
    }

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(applicationId);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    await OAuth2AccessTokenService.completeAuthorization(
      {
        applicationId,
        redirectUri: session.redirectUri,
        code,
        codeVerifier: session.codeVerifier,
      },
      env,
    );
    await sessionDAO.consume(session.sessionId);
    return this.redirect(`/user?oauth2=connected&applicationId=${encodeURIComponent(applicationId)}`);
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
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { OAuth2CallbackRoute };
