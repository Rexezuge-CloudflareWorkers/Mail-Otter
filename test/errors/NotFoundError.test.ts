import { describe, expect, it } from 'vitest';
import { NotFoundError, ServiceError } from '@rexezuge/errors';

describe('NotFoundError', () => {
  it('maps to HTTP 404 with NotFound type', () => {
    const error = new NotFoundError('Connected application was not found.');
    expect(error).toBeInstanceOf(ServiceError);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.status).toBe(404);
    expect(error.type).toBe('NotFound');
    expect(error.message).toBe('Connected application was not found.');
  });

  it('uses a default message when none is provided', () => {
    expect(new NotFoundError().message).toBe('The requested resource was not found.');
  });

  it('exposes its message, because 404 is below the expose threshold', () => {
    // A `NotFoundError` names the thing that was missing, which is exactly what
    // the caller needs and carries nothing sensitive — so the taxonomy's
    // `expose` rule keeps it on the wire. The 5xx half of that rule is asserted
    // in `ErrorClasses.test.ts`.
    expect(new NotFoundError('missing').toErrorResponse().body.Exception.Message).toBe('missing');
  });
});
