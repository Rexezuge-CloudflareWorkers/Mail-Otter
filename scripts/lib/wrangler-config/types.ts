import { join } from 'node:path';

/**
 * Shared paths and placeholder ids for the wrangler config helpers.
 *
 * Every script that reads or writes `wrangler.jsonc` resolves it here, so the
 * backup workflow cannot end up inspecting a different file than the deploy
 * materialized.
 */
export const CONFIG_PATH = join(process.cwd(), 'wrangler.jsonc');

/**
 * The id `apps/api/wrangler.template.jsonc` carries for a D1 database that does
 * not exist yet. `prepare-wrangler-config.ts` replaces it with a real id;
 * `resolveD1Target` refuses to export while it is still in place, because a
 * database that was just created holds no user data.
 */
export const DEFAULT_UUID = '00000000-0000-0000-0000-000000000000';
