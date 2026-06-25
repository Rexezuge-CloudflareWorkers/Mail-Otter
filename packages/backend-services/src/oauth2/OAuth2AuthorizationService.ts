import { CONNECTION_METHOD_OAUTH2 } from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, OAuth2AuthorizationSessionDAO } from '@mail-otter/backend-data/dao';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { BadRequestError } from '@mail-otter/backend-errors';
import type { ConnectedApplication, OAuth2AuthorizationSession, OAuth2Credentials } from '@mail-otter/shared/model';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { BaseUrlUtil, TimestampUtil } from '@mail-otter/shared/utils';
import { OAuth2ProviderUtil } from '@mail-otter/provider-clients/oauth2';
import { OAuth2AccessTokenService } from './OAuth2AccessTokenService';
import type { OAuth2AccessTokenServiceEnv } from './OAuth2AccessTokenService';
import { OAuth2StateUtil } from './OAuth2StateUtil';

class OAuth2AuthorizationService {
  constructor(private readonly env: OAuth2AuthorizationServiceEnv) {}

  async createAuthorization(userEmail: string, applicationId: string, raw: Request): Promise<OAuth2AuthorizationResult> {
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
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
    const expiryMinutes: number = ConfigurationManager.getOauth2StateExpiryMinutes(this.env);
    const expiresAt: number = TimestampUtil.addMinutes(TimestampUtil.getCurrentUnixTimestampInSeconds(), expiryMinutes);
    const sessionDAO = new OAuth2AuthorizationSessionDAO(this.env.DB);
    await sessionDAO.create(application.applicationId, stateHash, codeVerifier, redirectUri, expiresAt);
    return {
      authorizationUrl: OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: application.providerId,
        clientId: credentials.clientId,
        redirectUri,
        state,
        codeChallenge,
        enabledFeatures: application.enabledFeatures ?? [],
      }),
      redirectUri,
      expiresAt,
    };
  }

  async completeCallback(input: CompleteOAuth2CallbackInput): Promise<void> {
    const stateHash: string = await OAuth2StateUtil.getStateHash(input.state);
    const sessionDAO = new OAuth2AuthorizationSessionDAO(this.env.DB);
    const session: OAuth2AuthorizationSession | undefined = await sessionDAO.getActive(input.applicationId, stateHash);
    if (!session) {
      throw new BadRequestError('OAuth2 authorization session is invalid or expired.');
    }

    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const applicationDAO = new ConnectedApplicationDAO(this.env.DB, masterKey);
    const application: ConnectedApplication | undefined = await applicationDAO.getById(input.applicationId);
    if (!application) {
      throw new BadRequestError('Connected application was not found.');
    }
    await new OAuth2AccessTokenService(this.env as OAuth2AccessTokenServiceEnv).completeAuthorization({
      applicationId: input.applicationId,
      redirectUri: session.redirectUri,
      code: input.code,
      codeVerifier: session.codeVerifier,
    });
    await sessionDAO.consume(session.sessionId);
  }
}

const OAuth2AuthorizationServiceFactory = {
  create(env: OAuth2AuthorizationServiceEnv): OAuth2AuthorizationService {
    return new OAuth2AuthorizationService(env);
  },
};

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

interface OAuth2AuthorizationServiceEnv {
  DB: D1Queryable;
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE?: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS?: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
  OAUTH2_STATE_EXPIRY_MINUTES?: string;
}

export { OAuth2AuthorizationService, OAuth2AuthorizationServiceFactory };
export type { CompleteOAuth2CallbackInput, OAuth2AuthorizationResult, OAuth2AuthorizationServiceEnv };
