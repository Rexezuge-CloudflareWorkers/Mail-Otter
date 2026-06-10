import { InternalServerError } from './InternalServerError';

class DatabaseError extends InternalServerError {
  public readonly retryable: boolean;

  constructor(message?: string | undefined, retryable: boolean = false) {
    super(message ?? 'The system encountered an unexpected problem while accessing the database.');
    this.retryable = retryable;
  }

  public getErrorType(): string {
    return 'DatabaseError';
  }
}

export { DatabaseError };
