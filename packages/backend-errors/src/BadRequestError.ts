import { ErrorCode, ServiceError } from './IServiceError';

class BadRequestError extends ServiceError {
  constructor(message?: string) {
    super(message ?? 'The request could not be understood or was missing required parameters.');
  }

  public getErrorCode(): ErrorCode {
    return 400;
  }

  public getErrorType(): string {
    return 'BadRequest';
  }

  public getErrorMessage(): string {
    return this.message;
  }
}

export { BadRequestError };
