import { ErrorCode, IServiceError } from './IServiceError';

class ForbiddenError extends IServiceError {
  constructor(message?: string | undefined) {
    super(message ?? 'You do not have permission to perform this action.');
  }

  public getErrorCode(): ErrorCode {
    return 403;
  }

  public getErrorType(): string {
    return 'Forbidden';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { ForbiddenError };
