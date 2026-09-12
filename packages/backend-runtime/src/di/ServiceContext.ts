import type { IClock, ILogger } from '@mail-otter/shared/utils';
import { ConsoleLogger } from '@mail-otter/shared/utils';
import { SystemClock } from '@mail-otter/shared/utils';
import type { ServiceEnv } from '../config/ServiceEnv';

/**
 * Single request-scoped context replacing the 13+ bespoke `*Env`
 * structural subsets previously passed around with `as` casts.
 * Domain services accept this (or a narrower options object derived
 * from it) via constructor injection instead of `new X(env)` per call.
 */
interface ServiceContext {
  readonly env: ServiceEnv;
  readonly logger: ILogger;
  readonly clock: IClock;
}

interface ServiceContextOverrides {
  logger?: ILogger;
  clock?: IClock;
}

function createServiceContext(env: ServiceEnv, overrides: ServiceContextOverrides = {}): ServiceContext {
  return {
    env,
    logger: overrides.logger ?? new ConsoleLogger(),
    clock: overrides.clock ?? new SystemClock(),
  };
}

export { createServiceContext };
export type { ServiceContext, ServiceContextOverrides };
