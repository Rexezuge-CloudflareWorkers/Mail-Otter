/// <reference types="../../worker-configuration.d.ts" />

import type { Env as CloudflareEnvType } from '../../worker-configuration';

declare global {
  type Env = CloudflareEnvType;
}
