import { CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, OAuth2AuthorizationSessionDAO } from '@mail-otter/backend-data/dao';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplication, OAuth2AuthorizationSession, OAuth2Credentials } from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { BaseUrlUtil, TimestampUtil } from '@mail-otter/shared/utils';
import { OAuth2ProviderUtil } from '@mail-otter/provider-clients/oauth2';
import { OAuth2AccessTokenService } from './OAuth2AccessTokenService';
import { OAuth2StateUtil } from './OAuth2StateUtil';

class OAuth2AuthorizationService {
  public static async createAuthorization(
    userEmail: string,
    applicationId: string,
    env: CreateOAuth2AuthorizationEnv,
    raw: Request,
  ): Promise<OAuth2AuthorizationResult> {
    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getByIdForUser(applicationId, userEmail);
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
    const redirectUri: string = `${BaseUrlUtil.getBaseUrl(raw)}/api/oauth2/callback/${application.applicationId}`;
    const stateHash: string = await OAuth2StateUtil.getStateHash(state);
    const expiryMinutes: number = ConfigurationManager.getOauth2StateExpiryMinutes(env);
    const expiresAt: number = TimestampUtil.addMinutes(TimestampUtil.getCurrentUnixTimestampInSeconds(), expiryMinutes);
    const sessionDAO = new OAuth2AuthorizationSessionDAO(env.DB);
    await sessionDAO.create(application.applicationId, stateHash, codeVerifier, redirectUri, expiresAt);
    return {
      authorizationUrl: OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: application.providerId,
        clientId: credentials.clientId,
        redirectUri,
        state,
        codeChallenge,
      }),
      redirectUri,
      expiresAt,
    };
  }

  public static async completeCallback(input: CompleteOAuth2CallbackInput, env: CompleteOAuth2CallbackEnv): Promise<void> {
    const stateHash: string = await OAuth2StateUtil.getStateHash(input.state);
    const sessionDAO = new OAuth2AuthorizationSessionDAO(env.DB);
    const session: OAuth2AuthorizationSession | undefined = await sessionDAO.getActive(input.applicationId, stateHash);
    if (!session) {
      throw new BadRequestError('OAuth2 authorization session is invalid or expired.');
    }

    const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(input.applicationId);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    await OAuth2AccessTokenService.completeAuthorization(
      {
        applicationId: input.applicationId,
        redirectUri: session.redirectUri,
        code: input.code,
        codeVerifier: session.codeVerifier,
      },
      env,
    );
    await sessionDAO.consume(session.sessionId);
  }
}

interface OAuth2AuthorizationResult {
  authorizationUrl: string;
  redirectUri: string;
  expiresAt: number;
}

interface CompleteOAuth2CallbackInput {
  applicationId: string;
  code: string;
  state: string;
}

interface CreateOAuth2AuthorizationEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_STATE_EXPIRY_MINUTES?: string | undefined;
}

interface CompleteOAuth2CallbackEnv {
  DB: D1Database;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

export { OAuth2AuthorizationService };
export type { CompleteOAuth2CallbackEnv, CompleteOAuth2CallbackInput, CreateOAuth2AuthorizationEnv, OAuth2AuthorizationResult };
