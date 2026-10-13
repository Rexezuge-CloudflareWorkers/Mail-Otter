import type { Clock } from '@mail-otter/shared/utils';
import { SystemClock } from '@mail-otter/shared/utils';
import { createLogger } from '@rexezuge/runtime';
import type { Logger } from '@rexezuge/runtime';
import type { ServiceEnv } from '../config/ServiceEnv';

/**
 * Single request-scoped context replacing the 13+ bespoke `*Env`
 * structural subsets previously passed around with `as` casts.
 * Domain services accept this (or a narrower options object derived
 * from it) via constructor injection instead of `new X(env)` per call.
 *
 * Distinct from `@rexezuge/runtime`'s `RequestScope`, which is the opposite
 * idea: that one stores a `Container` on the request context so handlers resolve
 * `scope.get(Tokens.X)`. This is the `{ env, logger, clock }` dependency bundle
 * a service receives through its constructor, so both exist.
 */
interface ServiceContext {
  readonly env: ServiceEnv;
  readonly logger: Logger;
  readonly clock: Clock;
}

interface ServiceContextOverrides {
  logger?: Logger;
  clock?: Clock;
}

function createServiceContext(env: ServiceEnv, overrides: ServiceContextOverrides = {}): ServiceContext {
  return {
    env,
    logger: overrides.logger ?? createLogger('service', 'mail-otter'),
    clock: overrides.clock ?? new SystemClock(),
  };
}

export { createServiceContext };
export type { ServiceContext, ServiceContextOverrides };
