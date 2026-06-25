import { InternalServerError } from './InternalServerError';

class DatabaseError extends InternalServerError {
  constructor(message?: string, retryable: boolean = false) {
    super(message ?? 'The system encountered an unexpected problem while accessing the database.');
    this.retryable = retryable;
  }

  public override getErrorType(): string {
    return 'DatabaseError';
  }
}

export { DatabaseError };
