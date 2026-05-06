import { InternalServerError } from './InternalServerError';

class DatabaseError extends InternalServerError {
  constructor(message?: string | undefined) {
    super(message ?? 'The system encountered an unexpected problem while accessing the database.');
  }

  public getErrorType(): string {
    return 'DatabaseError';
  }
}

export { DatabaseError };
