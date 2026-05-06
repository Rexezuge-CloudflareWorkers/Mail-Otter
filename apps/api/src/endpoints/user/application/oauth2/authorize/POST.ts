import { CONNECTION_METHOD_OAUTH2, DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, OAuth2AuthorizationSessionDAO } from '@/dao';
import { BadRequestError } from '@/error';
import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import type { ConnectedApplication, OAuth2Credentials } from '@mail-otter/shared/model';
import { BaseUrlUtil, ConfigurationUtil, OAuth2ProviderUtil, OAuth2StateUtil, TimestampUtil } from '@/utils';

class CreateOAuth2AuthorizationRoute extends IUserRoute<
  CreateOAuth2AuthorizationRequest,
  CreateOAuth2AuthorizationResponse,
  CreateOAuth2AuthorizationEnv
> {
  schema = {
    tags: ['Applications'],
    summary: 'Create OAuth2 authorization URL',
    responses: {
      '200': {
        description: 'OAuth2 authorization URL created',
      },
    },
  };

  protected async handleRequest(
    request: CreateOAuth2AuthorizationRequest,
    env: CreateOAuth2AuthorizationEnv,
    cxt: RouteContext<CreateOAuth2AuthorizationEnv>,
  ): Promise<CreateOAuth2AuthorizationResponse> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO: ConnectedApplicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(
      request.applicationId,
      this.getAuthenticatedUserEmailAddress(cxt),
    );
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    if (application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
      throw new BadRequestError('Connected application does not use OAuth2.');
    }

    const credentials: OAuth2Credentials = application.credentials as OAuth2Credentials;
    const state: string = OAuth2StateUtil.generateState();
    const codeVerifier: string = OAuth2StateUtil.generateCodeVerifier();
    const codeChallenge: string = await OAuth2StateUtil.getCodeChallenge(codeVerifier);
    const redirectUri: string = `${BaseUrlUtil.getBaseUrl(request.raw)}/api/oauth2/callback/${application.applicationId}`;
    const stateHash: string = await OAuth2StateUtil.getStateHash(state);
    const expiryMinutes: number = ConfigurationUtil.getPositiveInteger(
      env.OAUTH2_STATE_EXPIRY_MINUTES,
      DEFAULT_OAUTH2_STATE_EXPIRY_MINUTES,
    );
    const expiresAt: number = TimestampUtil.addMinutes(TimestampUtil.getCurrentUnixTimestampInSeconds(), expiryMinutes);
    const sessionDAO: OAuth2AuthorizationSessionDAO = new OAuth2AuthorizationSessionDAO(env.DB);
    await sessionDAO.create(application.applicationId, stateHash, codeVerifier, redirectUri, expiresAt);
    const authorizationUrl: string = OAuth2ProviderUtil.buildAuthorizationUrl({
      providerId: application.providerId,
      clientId: credentials.clientId,
      redirectUri,
      state,
      codeChallenge,
    });
    return {
      authorizationUrl,
      redirectUri,
      expiresAt,
    };
  }
}

interface CreateOAuth2AuthorizationRequest extends IRequest {
  applicationId: string;
}

interface CreateOAuth2AuthorizationResponse extends IResponse {
  authorizationUrl: string;
  redirectUri: string;
  expiresAt: number;
}

interface CreateOAuth2AuthorizationEnv extends IUserEnv {
  OAUTH2_STATE_EXPIRY_MINUTES?: string | undefined;
}

export { CreateOAuth2AuthorizationRoute };
