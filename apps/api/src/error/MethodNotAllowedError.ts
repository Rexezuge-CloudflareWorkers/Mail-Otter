import { ErrorCode, IServiceError } from './IServiceError';

class MethodNotAllowedError extends IServiceError {
  constructor(message?: string | undefined) {
    super(message ?? 'The requested method is not allowed for this resource.');
  }

  public getErrorCode(): ErrorCode {
    return 405;
  }

  public getErrorType(): string {
    return 'MethodNotAllowed';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { MethodNotAllowedError };
