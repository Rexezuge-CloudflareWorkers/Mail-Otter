import { ErrorCode, ServiceError } from './IServiceError';

class InternalServerError extends ServiceError {
  constructor(message?: string) {
    super(message ?? 'The server encountered an internal error and was unable to complete your request.');
  }

  public getErrorCode(): ErrorCode {
    return 500;
  }

  public getErrorType(): string {
    return 'InternalServerError';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

const DefaultInternalServerError = new InternalServerError();

export { InternalServerError, DefaultInternalServerError };
