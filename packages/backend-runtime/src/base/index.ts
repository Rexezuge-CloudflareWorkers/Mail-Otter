/**
 * The worker bases are the kit's.
 *
 * Each one here was a byte-for-byte copy of the family's, so four copies could
 * drift from the canonical shape and from each other. The substantive change in
 * adopting them is not structural but a policy one: the kit reports an unhandled
 * rejection through an overridable `reportUnhandled(message, error)` rather than
 * calling `console.error` with the caught value directly.
 *
 * That default is a problem here, because these bases sit on the paths where the
 * caught value can transitively carry an OAuth token or a sealed credential. The
 * subclasses in `apps/background` therefore override `reportUnhandled`, and the
 * override is the whole reason the kit grew the hook — a base cannot know its
 * consumer's threat model.
 */
export { AbstractDurableObjectWorker, AbstractEntrypointWorker, AbstractQueueWorker, AbstractWorkflowWorker } from '@rexezuge/runtime';
export type { BaseWorkerOperation, WorkerExecutionContext, WorkerScheduledController } from '@rexezuge/runtime';
