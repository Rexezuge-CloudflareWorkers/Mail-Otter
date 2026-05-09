import { DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_EXCHANGE_URL, DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_REFRESH_URL } from '@/constants';
import { OAuth2AccessTokenCacheDAO } from '@/dao';
import { InternalServerError } from '@/error';
import { ConfigurationManager } from './ConfigurationManager';

interface OAuth2AccessTokenServiceEnv {
  AES_ENCRYPTION_KEY_SECRET: SecretsStoreSecret;
  OAUTH2_TOKEN_CACHE: KVNamespace;
  OAUTH2_TOKEN_REFRESHERS: DurableObjectNamespace;
  OAUTH2_ACCESS_TOKEN_MIN_VALID_SECONDS?: string | undefined;
}

interface OAuth2AccessTokenResult {
  accessToken: string;
  expiresAt: number;
  providerEmail?: string | undefined;
}

interface CompleteOAuth2AuthorizationInput {
  applicationId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

interface GetAccessTokenOptions {
  forceRefresh?: boolean | undefined;
  minValidSeconds?: number | undefined;
}

class OAuth2AccessTokenService {
  public static async getAccessToken(
    applicationId: string,
    env: OAuth2AccessTokenServiceEnv,
    options: GetAccessTokenOptions = {},
  ): Promise<string> {
    const minValidSeconds: number = options.minValidSeconds ?? ConfigurationManager.getOAuth2AccessTokenMinValidSeconds(env);
    if (!options.forceRefresh) {
      const masterKey: string = await env.AES_ENCRYPTION_KEY_SECRET.get();
      const cacheDAO = new OAuth2AccessTokenCacheDAO(env.OAUTH2_TOKEN_CACHE, masterKey);
      const cached = await cacheDAO.getCachedAccessToken(applicationId, minValidSeconds);
      if (cached) return cached.accessToken;
    }

    const result: OAuth2AccessTokenResult = await OAuth2AccessTokenService.refreshAccessToken(applicationId, env, {
      forceRefresh: options.forceRefresh,
      minValidSeconds,
    });
    return result.accessToken;
  }

  public static async refreshAccessToken(
    applicationId: string,
    env: OAuth2AccessTokenServiceEnv,
    options: GetAccessTokenOptions = {},
  ): Promise<OAuth2AccessTokenResult> {
    const minValidSeconds: number = options.minValidSeconds ?? ConfigurationManager.getOAuth2AccessTokenMinValidSeconds(env);
    return OAuth2AccessTokenService.invokeTokenWorker(DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_REFRESH_URL, applicationId, env, {
      applicationId,
      forceRefresh: options.forceRefresh === true,
      minValidSeconds,
    });
  }

  public static async completeAuthorization(
    input: CompleteOAuth2AuthorizationInput,
    env: OAuth2AccessTokenServiceEnv,
  ): Promise<OAuth2AccessTokenResult> {
    return OAuth2AccessTokenService.invokeTokenWorker(DURABLE_OBJECT_OAUTH2_TOKEN_REFRESHERS_EXCHANGE_URL, input.applicationId, env, input);
  }

  private static async invokeTokenWorker(
    url: string,
    applicationId: string,
    env: OAuth2AccessTokenServiceEnv,
    body: unknown,
  ): Promise<OAuth2AccessTokenResult> {
    const id: DurableObjectId = env.OAUTH2_TOKEN_REFRESHERS.idFromName(applicationId);
    const stub = env.OAUTH2_TOKEN_REFRESHERS.get(id);
    const response: Response = await stub.fetch(
      new Request(url, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
    const text: string = await response.text();
    const data = text ? (JSON.parse(text) as Partial<OAuth2AccessTokenResult> & { error?: string | undefined }) : {};
    if (!response.ok || !data.accessToken || !data.expiresAt) {
      throw new InternalServerError(`OAuth2 token worker failed: ${data.error || text || response.statusText}`);
    }
    return {
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
      providerEmail: data.providerEmail,
    };
  }
}

export { OAuth2AccessTokenService };
export type { CompleteOAuth2AuthorizationInput, GetAccessTokenOptions, OAuth2AccessTokenResult, OAuth2AccessTokenServiceEnv };
