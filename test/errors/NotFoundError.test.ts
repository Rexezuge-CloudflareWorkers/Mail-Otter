import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@mail-otter/backend-errors';
import { ServiceError } from '@mail-otter/backend-errors';

describe('NotFoundError', () => {
  it('maps to HTTP 404 with NotFound type', () => {
    const error = new NotFoundError('Connected application was not found.');
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.getErrorCode()).toBe(404);
    expect(error.getErrorType()).toBe('NotFound');
    expect(error.getErrorMessage()).toBe('Connected application was not found.');
  });

  it('uses a default message when none is provided', () => {
    expect(new NotFoundError().getErrorMessage()).toBe('The requested resource was not found.');
  });
});
