import { OAUTH2_FEATURE_SCOPES } from '@mail-otter/shared/constants';
import { BadRequestError, InternalServerError } from '@mail-otter/backend-errors';
import type { OAuth2Credentials } from '@mail-otter/shared/model';
import { getOAuth2Strategy } from './OAuth2Strategy';
import type { OAuth2Strategy } from './OAuth2Strategy';

interface OAuth2AuthorizationInput {
  providerId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  enabledFeatures?: string[];
}

interface OAuth2TokenExchangeInput {
  providerId: string;
  credentials: OAuth2Credentials;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

interface OAuth2RefreshInput {
  providerId: string;
  credentials: OAuth2Credentials;
}

interface OAuth2TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

class OAuth2ProviderUtil {
  public static getOAuth2Strategy(providerId: string): OAuth2Strategy {
    return getOAuth2Strategy(providerId);
  }

  public static buildAuthorizationUrl(input: OAuth2AuthorizationInput): string {
    const config = this.getProviderConfig(input.providerId);
    const url: URL = new URL(config.authorizationEndpoint);
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    const optionalScopes: string[] = (input.enabledFeatures ?? []).flatMap(
      (feature: string): string[] => OAUTH2_FEATURE_SCOPES[feature]?.[input.providerId] ?? [],
    );
    const scope: string = [config.requiredScopes, ...optionalScopes].join(' ');
    url.searchParams.set('scope', scope);
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    for (const [key, value] of Object.entries(config.extraAuthParams)) {
      url.searchParams.set(key, value);
    }
    return url.href;
  }

  public static async exchangeCode(input: OAuth2TokenExchangeInput): Promise<OAuth2TokenResult> {
    const config = this.getProviderConfig(input.providerId);
    const data = await this.postTokenRequest(config.tokenEndpoint, {
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    });
    if (!data.refresh_token) {
      throw new BadRequestError('OAuth2 provider did not return a refresh token. Reconnect and approve offline access.');
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: this.parseExpiresIn(data.expires_in),
    };
  }

  public static async refreshAccessToken(input: OAuth2RefreshInput): Promise<OAuth2TokenResult> {
    if (!input.credentials.refreshToken) {
      throw new BadRequestError('Connected application is not fully authorized.');
    }
    const config = this.getProviderConfig(input.providerId);
    const data = await this.postTokenRequest(config.tokenEndpoint, {
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.credentials.refreshToken,
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: this.parseExpiresIn(data.expires_in),
    };
  }

  public static getExpiresInSeconds(tokenResult: OAuth2TokenResult, fallbackTtlSeconds: number): number {
    return tokenResult.expiresIn && tokenResult.expiresIn > 0 ? tokenResult.expiresIn : fallbackTtlSeconds;
  }

  private static getProviderConfig(providerId: string): OAuth2Strategy {
    return getOAuth2Strategy(providerId);
  }

  private static async postTokenRequest(tokenEndpoint: string, values: Record<string, string>): Promise<OAuth2TokenResponse> {
    const body: URLSearchParams = new URLSearchParams(values);
    const response: Response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = JSON.parse(await response.text()) as OAuth2TokenResponse;
    if (!response.ok || !data.access_token) {
      const message: string = `OAuth2 token request failed: ${data.error_description || data.error || response.statusText}`;
      if (response.status >= 400 && response.status < 500) {
        throw new BadRequestError(message);
      }
      throw new InternalServerError(message);
    }
    return data;
  }

  private static parseExpiresIn(expiresIn: number | string | undefined): number | undefined {
    if (typeof expiresIn === 'number') return Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : undefined;
    if (typeof expiresIn === 'string') {
      const parsed: number = Number(expiresIn);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
    return undefined;
  }
}

interface OAuth2TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

export { OAuth2ProviderUtil };
export type { OAuth2TokenResult };
