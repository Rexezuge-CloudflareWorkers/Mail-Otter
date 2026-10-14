import { RetryableError } from '@rexezuge/errors';

/**
 * Workers AI did not produce a usable summary.
 *
 * Product-local, so it lives here rather than in the kit: `@rexezuge/errors`
 * owns the HTTP/outcome taxonomy, and this is a domain failure that happens to
 * carry two extra facts — the usage record and whatever text the model did
 * return. Both are read by `EmailSummaryOrchestrator` to decide whether a
 * fallback model is worth attempting and to record what the primary produced,
 * so they have to survive on the error rather than in a side channel.
 *
 * Extends the kit's `RetryableError`, which sets status 502 by default: a
 * transient upstream failure, which is exactly what a model returning garbage
 * or nothing is. It is retryable in the sense that matters here — a different
 * model may well succeed — rather than in the sense that re-sending the same
 * request would.
 */
interface AiSummaryRetryableErrorOptions {
  /**
  The Workers AI usage record for the failed call, when one was returned.
  */
  aiUsage?: unknown;
  /**
  Whatever text the model did return, kept for the fallback comparison.
  */
  aiOutputText?: string;
}

class AiSummaryRetryableError extends RetryableError {
  public readonly aiUsage: unknown;
  public readonly aiOutputText: string | undefined;

  constructor(message: string, options: AiSummaryRetryableErrorOptions = {}) {
    super(message);
    this.aiUsage = options.aiUsage;
    this.aiOutputText = options.aiOutputText;
  }
}

export { AiSummaryRetryableError };
export type { AiSummaryRetryableErrorOptions };
