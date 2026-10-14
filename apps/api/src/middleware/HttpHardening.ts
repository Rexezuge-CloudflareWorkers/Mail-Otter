import { rateLimit, securityHeaders, sensitivePaths } from '@rexezuge/http';
import type { RateLimitHandler } from '@rexezuge/http';

/**
 * The public surfaces, split by what is actually being protected.
 *
 * There are three, and they are not interchangeable:
 *
 * | Surface                  | Key                | Guard against                    |
 * | ------------------------ | ------------------ | -------------------------------- |
 * | `/user/*`                | the account        | a runaway client, not an attacker |
 * | `/api/actions/*`         | the client address  | forged signature / token replay   |
 * | `/api/oauth2/callback/*` | the client address  | `state` and PKCE brute-force      |
 * | `/api/webhooks/*`        | **not limited**     | —                                |
 *
 * ## Why `/user/*` is keyed on the account and not the address
 *
 * Cloudflare Access has already authenticated this caller, so the threat here is
 * not anonymity — it is a client that loops. The account is the right key because
 * an address is shared: a corporate NAT puts a whole office in one bucket, and
 * the ceiling below would then throttle the office rather than the loop. The
 * kit's limiter prefers an identity over `CF-Connecting-IP` for the same reason.
 *
 * This means **the limiter must be registered after `userAuthentication`**. Hono
 * runs middleware in registration order, so a limiter installed first sees no
 * identity and silently degrades to a per-IP bucket — every operator behind one
 * NAT sharing a budget, which is the failure the identity key exists to avoid.
 *
 * ## Why `/api/webhooks/*` is deliberately unlimited
 *
 * Providers batch and retry on their own schedule. Gmail's push notification and
 * Outlook's lifecycle endpoint can legitimately arrive in bursts, and Outlook
 * in particular re-delivers, so any ceiling low enough to be worth having is low
 * enough to drop real mail. Those routes are already authenticated by a shared
 * secret or a `clientState` token that is checked before the work is enqueued, so
 * a limiter here would cost delivery reliability and buy nothing.
 */
const USER_API_LIMIT: RateLimitHandler = rateLimit({
  windowMs: 60_000,
  max: 300,
  keyPrefix: 'user-api',
});

const PUBLIC_CALLBACK_LIMIT: RateLimitHandler = rateLimit({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'public-callback',
});

/**
 * Baseline response headers.
 *
 * `isSensitive` is required rather than defaulted by the kit, because both wrong
 * answers are silent: a predicate that returns `true` for everything attaches
 * `no-store` to the SPA shell and the docs page, and one that returns `false`
 * for everything leaves authenticated JSON cacheable by a shared proxy.
 *
 * `/user/` covers the SPA shell and every authenticated API response. `/api/actions/`
 * is the confirmation and execute surface, whose pages carry one-time signed
 * tokens — a cached copy is a replayed one.
 */
const securityHeadersMiddleware = securityHeaders(sensitivePaths('/user/', '/api/actions/'));

export { PUBLIC_CALLBACK_LIMIT, securityHeadersMiddleware, USER_API_LIMIT };
