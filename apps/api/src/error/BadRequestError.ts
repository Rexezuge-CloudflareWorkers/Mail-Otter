import { ErrorCode, IServiceError } from './IServiceError';

class BadRequestError extends IServiceError {
  constructor(message?: string | undefined) {
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
