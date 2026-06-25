import { ErrorCode, ServiceError } from './IServiceError';

class MethodNotAllowedError extends ServiceError {
  constructor(message?: string) {
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
