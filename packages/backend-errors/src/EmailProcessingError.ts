import { NonRetryableError } from './NonRetryableError';
import { RetryableError } from './RetryableError';

class AiSummaryRetryableError extends RetryableError {
  public readonly aiUsage: unknown;
  public readonly aiOutputText: string | undefined;

  constructor(message: string, options: AiSummaryRetryableErrorOptions = {}) {
    super(message);
    this.aiUsage = options.aiUsage;
    this.aiOutputText = options.aiOutputText;
  }
}

class ProviderApiRetryableError extends RetryableError {}

class ProviderApiNonRetryableError extends NonRetryableError {}

class OAuth2TokenRetryableError extends RetryableError {}

class OAuth2TokenNonRetryableError extends NonRetryableError {}

export {
  AiSummaryRetryableError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
};

interface AiSummaryRetryableErrorOptions {
  aiUsage?: unknown;
  aiOutputText?: string;
}
