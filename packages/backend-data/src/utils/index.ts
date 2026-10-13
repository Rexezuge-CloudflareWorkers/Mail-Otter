/**
 * The D1 kernel is the kit's.
 *
 * `CursorCodec` (`@rexezuge/shared`), the retry engine and the error classifier
 * (`@rexezuge/d1`) each replaced a local copy that had drifted. The two that
 * stay are genuinely this app's and are the reason this barrel still exists at
 * all: D1 session consistency (`withSession` bookmarks, which the SDK has no
 * opinion about) and the retention-prune batching the cron tasks drive.
 */
export { CursorCodec } from '@rexezuge/shared';
export { isD1ErrorRetryable } from '@rexezuge/d1';
// Re-exported rather than re-declared: the session helper narrowed `DB` to
// `D1DatabaseSession`, and this is the type the DAOs actually take.
export type { D1Queryable } from '@rexezuge/d1';

export { createD1SessionEnv } from './D1SessionUtil';
export type { D1SessionEnv } from './D1SessionUtil';
export { DEFAULT_PRUNE_BATCH_SIZE, computeDateCutoffIso, computeUnixCutoffSeconds, pruneInBatches } from './RepositoryHelper';
