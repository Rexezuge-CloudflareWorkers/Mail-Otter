import { DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_EXCHANGE_URL, DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_REFRESH_URL } from '@mail-otter/backend-runtime/constants';
import { OAuth2AccessTokenCacheDAO } from '@mail-otter/backend-data/dao';
import { OAuth2TokenNonRetryableError, OAuth2TokenRetryableError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';

interface OAuth2AccessTokenServiceEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string;
}

interface OAuth2AccessTokenResult {
  accessToken: string;
  expiresAt: number;
  providerEmail?: string;
}

interface CompleteOAuth2AuthorizationInput {
  applicationId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

interface GetAccessTokenOptions {
  forceRefresh?: boolean;
  minValidSeconds?: number;
}

class OAuth2AccessTokenService {
  constructor(private readonly env: OAuth2AccessTokenServiceEnv) {}

  async getAccessToken(applicationId: string, options: GetAccessTokenOptions = {}): Promise<string> {
    const minValidSeconds: number = options.minValidSeconds ?? ConfigurationManager.getOAuth2AccessTokenMinValidSeconds(this.env);
    if (!options.forceRefresh) {
      const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
      const cacheDAO = new OAuth2AccessTokenCacheDAO(this.env.OAUTH2_TOKEN_CACHE, masterKey);
      const cached = await cacheDAO.getCachedAccessToken(applicationId, minValidSeconds);
      if (cached) return cached.accessToken;
    }

    const result: OAuth2AccessTokenResult = await this.refreshAccessToken(applicationId, { forceRefresh: options.forceRefresh, minValidSeconds });
    return result.accessToken;
  }

  async refreshAccessToken(applicationId: string, options: GetAccessTokenOptions = {}): Promise<OAuth2AccessTokenResult> {
    const minValidSeconds: number = options.minValidSeconds ?? ConfigurationManager.getOAuth2AccessTokenMinValidSeconds(this.env);
    return this.invokeTokenWorker(DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_REFRESH_URL, applicationId, {
      applicationId,
      forceRefresh: options.forceRefresh === true,
      minValidSeconds,
    });
  }

  async completeAuthorization(input: CompleteOAuth2AuthorizationInput): Promise<OAuth2AccessTokenResult> {
    return this.invokeTokenWorker(DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_EXCHANGE_URL, input.applicationId, input);
  }

  private async invokeTokenWorker(url: string, applicationId: string, body: unknown): Promise<OAuth2AccessTokenResult> {
    const id: DurableObjectId = this.env.OAUTH2_TOKEN_REFRESHERS.idFromName(applicationId);
    const stub = this.env.OAUTH2_TOKEN_REFRESHERS.get(id);
    const response: Response = await stub.fetch(
      new Request(url, { method: 'POST', body: JSON.stringify(body) }),
    );
    const text: string = await response.text();
    const data = text ? (JSON.parse(text) as Partial<OAuth2AccessTokenResult> & { error?: string }) : {};
    if (!response.ok || !data.accessToken || !data.expiresAt) {
      const message: string = `OAuth2 token worker failed: ${data.error || text || response.statusText}`;
      if (response.status >= 400 && response.status < 500) {
        throw new OAuth2TokenNonRetryableError(message);
      }
      throw new OAuth2TokenRetryableError(message);
    }
    return { accessToken: data.accessToken, expiresAt: data.expiresAt, providerEmail: data.providerEmail };
  }
}

const OAuth2AccessTokenServiceFactory = {
  create(env: OAuth2AccessTokenServiceEnv): OAuth2AccessTokenService {
    return new OAuth2AccessTokenService(env);
  },
};

export { OAuth2AccessTokenService, OAuth2AccessTokenServiceFactory };
export type { CompleteOAuth2AuthorizationInput, GetAccessTokenOptions, OAuth2AccessTokenResult, OAuth2AccessTokenServiceEnv };
