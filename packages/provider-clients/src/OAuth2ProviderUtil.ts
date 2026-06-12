import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import type { ProviderId } from '@mail-otter/shared/constants';
import { BadRequestError, InternalServerError } from '@mail-otter/backend-errors';
import type { OAuth2Credentials } from '@mail-otter/shared/model';

interface OAuth2AuthorizationInput {
  providerId: ProviderId | string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

interface OAuth2TokenExchangeInput {
  providerId: ProviderId | string;
  credentials: OAuth2Credentials;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

interface OAuth2RefreshInput {
  providerId: ProviderId | string;
  credentials: OAuth2Credentials;
}

interface OAuth2TokenResult {
  accessToken: string;
  refreshToken?: string | undefined;
  expiresIn?: number | undefined;
}

const ProviderConfig = {
  [PROVIDER_GOOGLE_GMAIL]: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope:
      'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events',
  },
  [PROVIDER_MICROSOFT_OUTLOOK]: {
    authorizationEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scope:
      'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite offline_access',
  },
} as const;

class OAuth2ProviderUtil {
  public static buildAuthorizationUrl(input: OAuth2AuthorizationInput): string {
    const config = OAuth2ProviderUtil.getProviderConfig(input.providerId);
    const url: URL = new URL(config.authorizationEndpoint);
    url.searchParams.set('client_id', input.clientId);
    url.searchParams.set('redirect_uri', input.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scope);
    url.searchParams.set('state', input.state);
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (input.providerId === PROVIDER_GOOGLE_GMAIL) {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
    } else if (input.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      url.searchParams.set('response_mode', 'query');
    }
    return url.toString();
  }

  public static async exchangeCode(input: OAuth2TokenExchangeInput): Promise<OAuth2TokenResult> {
    const config = OAuth2ProviderUtil.getProviderConfig(input.providerId);
    const data = await OAuth2ProviderUtil.postTokenRequest(config.tokenEndpoint, {
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
      expiresIn: OAuth2ProviderUtil.parseExpiresIn(data.expires_in),
    };
  }

  public static async refreshAccessToken(input: OAuth2RefreshInput): Promise<OAuth2TokenResult> {
    if (!input.credentials.refreshToken) {
      throw new BadRequestError('Connected application is not fully authorized.');
    }
    const config = OAuth2ProviderUtil.getProviderConfig(input.providerId);
    const data = await OAuth2ProviderUtil.postTokenRequest(config.tokenEndpoint, {
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: input.credentials.refreshToken,
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: OAuth2ProviderUtil.parseExpiresIn(data.expires_in),
    };
  }

  public static getExpiresInSeconds(tokenResult: OAuth2TokenResult, fallbackTtlSeconds: number): number {
    return tokenResult.expiresIn && tokenResult.expiresIn > 0 ? tokenResult.expiresIn : fallbackTtlSeconds;
  }

  private static getProviderConfig(providerId: string) {
    const config = ProviderConfig[providerId as keyof typeof ProviderConfig];
    if (!config) {
      throw new BadRequestError(`Unsupported OAuth2 provider: ${providerId}`);
    }
    return config;
  }

  private static async postTokenRequest(tokenEndpoint: string, values: Record<string, string>): Promise<OAuth2TokenResponse> {
    const body: URLSearchParams = new URLSearchParams(values);
    const response: Response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await response.json()) as OAuth2TokenResponse;
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
  refresh_token?: string | undefined;
  expires_in?: number | string | undefined;
  error?: string | undefined;
  error_description?: string | undefined;
}

export { OAuth2ProviderUtil };
export type { OAuth2TokenResult };
