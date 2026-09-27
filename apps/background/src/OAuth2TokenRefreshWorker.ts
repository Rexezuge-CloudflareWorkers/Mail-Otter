import { AbstractDurableObjectWorker } from '@mail-otter/backend-runtime/base';
import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
} from '@mail-otter/shared/constants';
import { ConnectedApplicationDAO, OAuth2AccessTokenCacheDAO, OAuth2AccessTokenRefreshStatusDAO } from '@mail-otter/backend-data/dao';
import { createD1SessionEnv } from '@mail-otter/backend-data/utils';
import type { ConnectedApplication, OAuth2Credentials } from '@mail-otter/shared/model';
import { TimestampUtil, logTokenAdjacentError } from '@mail-otter/shared/utils';
import { BadRequestError, NotFoundError, ProviderApiNonRetryableError } from '@mail-otter/backend-errors';
import { ConfigurationManager } from '@mail-otter/backend-runtime/config';
import { GmailProviderUtil } from '@mail-otter/provider-clients/gmail';
import { OAuth2ProviderUtil } from '@mail-otter/provider-clients/oauth2';
import { OutlookProviderUtil } from '@mail-otter/provider-clients/outlook';
import type { OAuth2TokenResult } from '@mail-otter/provider-clients/oauth2';

const TOKEN_REFRESH_PATH: string = '/refresh';
const TOKEN_EXCHANGE_PATH: string = '/exchange';

interface OAuth2TokenRefreshRequest {
  applicationId?: unknown;
  forceRefresh?: unknown;
  minValidSeconds?: unknown;
}

interface OAuth2TokenExchangeRequest {
  applicationId?: unknown;
  redirectUri?: unknown;
  code?: unknown;
  codeVerifier?: unknown;
}

interface OAuth2TokenWorkerResponse {
  accessToken: string;
  expiresAt: number;
  providerEmail?: string;
}

class OAuth2TokenRefreshWorker extends AbstractDurableObjectWorker {
  private currentOperation: Promise<unknown> | undefined;

  protected async onRequest(request: Request): Promise<Response> {
    const url: URL = new URL(request.url);
    if (url.pathname !== TOKEN_REFRESH_PATH && url.pathname !== TOKEN_EXCHANGE_PATH) {
      return Response.json({ error: 'Not Found' }, { status: 404 });
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method Not Allowed' }, { status: 405, headers: { Allow: 'POST' } });
    }

    try {
      const payload: unknown = await this.readJson(request);
      const result: OAuth2TokenWorkerResponse =
        url.pathname === TOKEN_REFRESH_PATH
          ? await this.runExclusive((): Promise<OAuth2TokenWorkerResponse> => this.refreshAccessToken(payload as OAuth2TokenRefreshRequest))
          : await this.runExclusive((): Promise<OAuth2TokenWorkerResponse> => this.exchangeCode(payload as OAuth2TokenExchangeRequest));
      return Response.json(result);
    } catch (error: unknown) {
      const status: number =
        error instanceof NotFoundError
          ? 404
          : error instanceof BadRequestError || error instanceof ProviderApiNonRetryableError
            ? 400
            : 500;
      const message: string = error instanceof Error ? error.message : String(error);
      // Never interpolate the caught error here: this DO handles refresh tokens
      // and auth codes, and `js/clear-text-logging` traces that taint through
      // the thrown value. The cause is already persisted by
      // `OAuth2AccessTokenRefreshStatusDAO.recordRefreshFailure`.
      if (status >= 500) logTokenAdjacentError('error', 'OAuth2 token operation failed');
      return Response.json({ error: message }, { status });
    }
  }

  /**
   * Serialize token operations so two refreshes never race.
   *
   * The Durable Object runtime only holds its input gate across storage I/O.
   * These operations spend nearly all their time awaiting an external OAuth2
   * provider, during which the gate is released and another request is
   * delivered. `blockConcurrencyWhile` does not help either: it only gates the
   * constructor, not later requests.
   *
   * So exclusion is enforced here, and the claim has to be *synchronous*. The
   * previous version read the tail, then `await`ed it, and only afterwards
   * assigned the new tail. Two callers arriving during that await both read the
   * same predecessor, both waited on it, and both then ran concurrently — two
   * refresh-token requests with the same token. Google and Microsoft rotate
   * refresh tokens, so the second response invalidates the first, the next
   * refresh fails with `invalid_grant`, and the mailbox needs re-authorization.
   *
   * Chaining onto the tail without an intervening `await` makes the claim
   * atomic with respect to the single-threaded event loop: every caller
   * observes a distinct predecessor.
   */
  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previousOperation: Promise<unknown> | undefined = this.currentOperation;
    // Swallow a predecessor's rejection so one failure cannot poison the chain
    // for every later caller.
    const currentOperation: Promise<T> = previousOperation ? previousOperation.catch((): void => undefined).then(operation) : operation();
    this.currentOperation = currentOperation;
    return currentOperation.finally((): void => {
      if (this.currentOperation === currentOperation) {
        this.currentOperation = undefined;
      }
    });
  }

  private async refreshAccessToken(payload: OAuth2TokenRefreshRequest): Promise<OAuth2TokenWorkerResponse> {
    const applicationId: string = this.readRequiredString(payload.applicationId, 'applicationId');
    const forceRefresh: boolean = payload.forceRefresh === true;
    const minValidSeconds: number = this.readPositiveNumber(
      payload.minValidSeconds,
      ConfigurationManager.getOAuth2AccessTokenMinValidSeconds(this.env),
    );
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const cacheDAO = new OAuth2AccessTokenCacheDAO(this.env.OAUTH2_TOKEN_CACHE, masterKey);
    if (!forceRefresh) {
      const cached = await cacheDAO.getCachedAccessToken(applicationId, minValidSeconds);
      if (cached) {
        return {
          accessToken: cached.accessToken,
          expiresAt: cached.expiresAt,
        };
      }
    }

    const sessionEnv = createD1SessionEnv(this.env);
    const statusDAO = new OAuth2AccessTokenRefreshStatusDAO(sessionEnv.DB);
    await statusDAO.recordRefreshStarted(applicationId);
    try {
      const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);
      const application: ConnectedApplication = await this.getRefreshableApplication(applicationDAO, applicationId);
      const tokenResult: OAuth2TokenResult = await OAuth2ProviderUtil.refreshAccessToken({
        providerId: application.providerId,
        credentials: application.credentials as OAuth2Credentials,
      });
      if (tokenResult.refreshToken) {
        await applicationDAO.updateOAuth2RefreshToken(application.applicationId, tokenResult.refreshToken);
      }
      return this.storeSuccessfulToken(application.applicationId, tokenResult, cacheDAO, statusDAO);
    } catch (error: unknown) {
      await statusDAO.recordRefreshFailure(applicationId, this.formatError(error));
      throw error;
    }
  }

  private async exchangeCode(payload: OAuth2TokenExchangeRequest): Promise<OAuth2TokenWorkerResponse> {
    const applicationId: string = this.readRequiredString(payload.applicationId, 'applicationId');
    const redirectUri: string = this.readRequiredString(payload.redirectUri, 'redirectUri');
    const code: string = this.readRequiredString(payload.code, 'code');
    const codeVerifier: string = this.readRequiredString(payload.codeVerifier, 'codeVerifier');
    const masterKey: string = await this.env.AES_ENCRYPTION_KEY_SECRET.get();
    const sessionEnv = createD1SessionEnv(this.env);
    const applicationDAO = new ConnectedApplicationDAO(sessionEnv.DB, masterKey);
    const statusDAO = new OAuth2AccessTokenRefreshStatusDAO(sessionEnv.DB);
    await statusDAO.recordRefreshStarted(applicationId);

    try {
      const application: ConnectedApplication | undefined = await applicationDAO.getById(applicationId);
      if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
        throw new NotFoundError('OAuth2 application was not found.');
      }
      const tokenResult: OAuth2TokenResult = await OAuth2ProviderUtil.exchangeCode({
        providerId: application.providerId,
        credentials: application.credentials as OAuth2Credentials,
        redirectUri,
        code,
        codeVerifier,
      });
      const providerEmail: string = await this.getProviderEmail(application, tokenResult.accessToken);
      // A provider is not obliged to return a refresh token on every exchange.
      // Passing a possibly-undefined value through would spread it into
      // `OAuth2Credentials`, where `JSON.stringify` silently drops the key, and
      // the mailbox would be marked `connected` with no way to ever refresh.
      // Prefer the freshly issued token, fall back to the stored one, and refuse
      // to mark the application connected when neither exists.
      const existingRefreshToken: string | undefined = (application.credentials as OAuth2Credentials).refreshToken;
      const refreshToken: string | undefined = tokenResult.refreshToken ?? existingRefreshToken;
      if (!refreshToken) {
        throw new BadRequestError('Provider returned no refresh token and none was stored. Re-authorization is required.');
      }
      await applicationDAO.markOAuth2Connected(applicationId, refreshToken, providerEmail);
      const cacheDAO = new OAuth2AccessTokenCacheDAO(this.env.OAUTH2_TOKEN_CACHE, masterKey);
      return this.storeSuccessfulToken(application.applicationId, tokenResult, cacheDAO, statusDAO, providerEmail);
    } catch (error: unknown) {
      await statusDAO.recordRefreshFailure(applicationId, this.formatError(error));
      throw error;
    }
  }

  private async getRefreshableApplication(applicationDAO: ConnectedApplicationDAO, applicationId: string): Promise<ConnectedApplication> {
    const application: ConnectedApplication | undefined = await applicationDAO.getById(applicationId);
    if (!application || application.connectionMethod !== CONNECTION_METHOD_OAUTH2) {
      throw new NotFoundError('OAuth2 application was not found.');
    }
    if (application.status !== CONNECTED_APPLICATION_STATUS_CONNECTED) {
      throw new BadRequestError('Connected application is not authorized.');
    }
    return application;
  }

  private async getProviderEmail(application: ConnectedApplication, accessToken: string): Promise<string> {
    if (application.providerId === PROVIDER_GOOGLE_GMAIL) {
      const gmailProfile = await GmailProviderUtil.getProfile(accessToken);
      return gmailProfile.emailAddress;
    }
    if (application.providerId === PROVIDER_MICROSOFT_OUTLOOK) {
      const outlookProfile = await OutlookProviderUtil.getProfile(accessToken);
      return outlookProfile.emailAddress;
    }
    return application.userEmail;
  }

  private async storeSuccessfulToken(
    applicationId: string,
    tokenResult: OAuth2TokenResult,
    cacheDAO: OAuth2AccessTokenCacheDAO,
    statusDAO: OAuth2AccessTokenRefreshStatusDAO,
    providerEmail?: string,
  ): Promise<OAuth2TokenWorkerResponse> {
    const expiresInSeconds: number = OAuth2ProviderUtil.getExpiresInSeconds(
      tokenResult,
      ConfigurationManager.getOAuth2AccessTokenFallbackTtlSeconds(this.env),
    );
    const expiresAt: number = TimestampUtil.getCurrentUnixTimestampInSeconds() + expiresInSeconds;
    await cacheDAO.storeAccessToken(applicationId, tokenResult.accessToken, expiresAt);
    await statusDAO.recordRefreshSuccess(applicationId, expiresAt);
    return {
      accessToken: tokenResult.accessToken,
      expiresAt,
      providerEmail,
    };
  }

  private async readJson(request: Request): Promise<unknown> {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }

  private readRequiredString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestError(`OAuth2 token request is missing ${fieldName}.`);
    }
    return value;
  }

  private readPositiveNumber(value: unknown, fallback: number): number {
    if (typeof value !== 'number') return fallback;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export { OAuth2TokenRefreshWorker };
export type { OAuth2TokenWorkerResponse };
