import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestError,
  DatabaseError,
  DefaultInternalServerError,
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NonRetryableError,
  NotFoundError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
  RetryableError,
  ServiceError,
  UnauthorizedError,
} from '@rexezuge/errors';
import { AiSummaryRetryableError } from '@mail-otter/backend-services/errors';

/**
 * These assertions read `status` / `type` / `message` off the error rather than
 * calling `getErrorCode()` / `getErrorType()` / `getErrorMessage()`.
 *
 * The taxonomy moved to public fields because callers read those values far more
 * often than they wrote them, and a getter meant every call site re-derived a
 * value the error already held. The two outcome-error status defaults changed
 * with it and are asserted explicitly below — they are the one behavioural
 * difference a consumer inherits from the migration.
 */
describe('Error Classes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('BadRequestError', () => {
    it('uses default message when none provided', () => {
      const error = new BadRequestError();
      expect(error.status).toBe(400);
      expect(error.type).toBe('BadRequest');
      expect(error.message).toBe('The request could not be understood or was missing required parameters.');
      expect(error).toBeInstanceOf(BadRequestError);
    });

    it('uses custom message when provided', () => {
      const error = new BadRequestError('Custom error');
      expect(error.message).toBe('Custom error');
    });
  });

  describe('UnauthorizedError', () => {
    it('uses default message when none provided', () => {
      const error = new UnauthorizedError();
      expect(error.status).toBe(401);
      expect(error.type).toBe('Unauthorized');
      expect(error.message).toBe('Authentication is required and has failed or has not yet been provided.');
    });

    it('uses custom message when provided', () => {
      const error = new UnauthorizedError('Custom error');
      expect(error.message).toBe('Custom error');
    });
  });

  describe('ForbiddenError', () => {
    it('uses default message when none provided', () => {
      const error = new ForbiddenError();
      expect(error.status).toBe(403);
      expect(error.type).toBe('Forbidden');
      expect(error.message).toBe('You do not have permission to perform this action.');
    });

    it('uses custom message when provided', () => {
      const error = new ForbiddenError('Custom error');
      expect(error.message).toBe('Custom error');
    });
  });

  describe('MethodNotAllowedError', () => {
    it('uses default message when none provided', () => {
      const error = new MethodNotAllowedError();
      expect(error.status).toBe(405);
      expect(error.type).toBe('MethodNotAllowed');
      expect(error.message).toBe('The requested method is not allowed for this resource.');
    });

    it('uses custom message when provided', () => {
      const error = new MethodNotAllowedError('Custom error');
      expect(error.message).toBe('Custom error');
    });
  });

  describe('InternalServerError', () => {
    it('uses default message when none provided', () => {
      const error = new InternalServerError();
      expect(error.status).toBe(500);
      expect(error.type).toBe('InternalServerError');
      expect(error.message).toBe('The server encountered an internal error and was unable to complete your request.');
    });

    it('uses custom message when provided', () => {
      const error = new InternalServerError('Custom error');
      expect(error.message).toBe('Custom error');
    });
  });

  describe('DefaultInternalServerError', () => {
    it('is a singleton instance with default message', () => {
      expect(DefaultInternalServerError.status).toBe(500);
      expect(DefaultInternalServerError.type).toBe('InternalServerError');
      expect(DefaultInternalServerError.message).toBe('The server encountered an internal error and was unable to complete your request.');
    });
  });

  describe('DatabaseError', () => {
    it('extends InternalServerError with default message', () => {
      const error = new DatabaseError();
      expect(error.status).toBe(500);
      expect(error.type).toBe('DatabaseError');
      expect(error.message).toBe('The system encountered an unexpected problem while accessing the database.');
      expect(error.retryable).toBe(false);
    });

    it('is retryable when set to true', () => {
      const error = new DatabaseError('DB error', true);
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('DB error');
    });

    it('is not retryable by default', () => {
      const error = new DatabaseError();
      expect(error.retryable).toBe(false);
    });
  });

  describe('NonRetryableError', () => {
    it('has retryable set to false', () => {
      const error = new NonRetryableError('Fatal error');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe('Fatal error');
      expect(error.name).toBe('NonRetryableError');
    });

    it('defaults to 400, because retrying a permanent failure is a client error', () => {
      // Was 500 before the migration. A revoked OAuth grant that reported a
      // server fault sent operators looking for a fault that was never there,
      // and told the caller to retry something that can never succeed.
      expect(new NonRetryableError('Fatal error').status).toBe(400);
    });

    it('honours an explicit status', () => {
      expect(new NonRetryableError('Fatal error', 409).status).toBe(409);
    });
  });

  describe('RetryableError', () => {
    it('has retryable set to true', () => {
      const error = new RetryableError('Transient error');
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('Transient error');
      expect(error.name).toBe('RetryableError');
    });

    it('defaults to 502, because a retryable failure is upstream', () => {
      // Was 500 before the migration; 502 is what distinguishes "we can try
      // again" from "this handler is broken".
      expect(new RetryableError('Transient error').status).toBe(502);
    });

    it('honours an explicit status', () => {
      expect(new RetryableError('Transient error', 503).status).toBe(503);
    });
  });

  describe('toErrorResponse masks non-exposed messages', () => {
    it('passes a 4xx message through', () => {
      expect(new BadRequestError('Which field?').toErrorResponse()).toEqual({
        status: 400,
        body: { Exception: { Type: 'BadRequest', Message: 'Which field?' } },
      });
    });

    it('substitutes the generic message for a 5xx', () => {
      // The leak this closes: a DatabaseError carrying `Failed to <ctx>: <d1
      // message>` used to ship verbatim to the client.
      const { status, body } = new DatabaseError('Failed to read user: D1_ERROR: no such table: users').toErrorResponse();
      expect(status).toBe(500);
      expect(body.Exception.Message).toBe('The server encountered an internal error and was unable to complete your request.');
      expect(JSON.stringify(body)).not.toContain('no such table');
    });

    it('still exposes a 5xx that opts in', () => {
      expect(new InternalServerError('Quota exceeded', { expose: true }).toErrorResponse().body.Exception.Message).toBe('Quota exceeded');
    });
  });

  describe('ServiceError.from normalizes an unknown catch value', () => {
    it('passes a typed error through untouched', () => {
      const original = new NotFoundError('nope');
      expect(ServiceError.from(original)).toBe(original);
    });

    it('wraps a plain Error as a non-exposed 500 carrying the cause', () => {
      const cause = new Error('kaboom');
      const wrapped = ServiceError.from(cause);
      expect(wrapped.status).toBe(500);
      expect(wrapped.retryable).toBe(false);
      expect(wrapped.expose).toBe(false);
      expect(wrapped.cause).toBe(cause);
    });

    it('wraps a thrown non-Error', () => {
      expect(ServiceError.from('a string').message).toBe('a string');
    });
  });

  describe('product-local subclasses', () => {
    describe('AiSummaryRetryableError', () => {
      it('extends RetryableError with optional usage data', () => {
        const usage = { promptTokens: 100, completionTokens: 50 };
        const error = new AiSummaryRetryableError('AI error', { aiUsage: usage, aiOutputText: '{"bad": true}' });
        expect(error.retryable).toBe(true);
        expect(error.message).toBe('AI error');
        expect(error.aiUsage).toEqual(usage);
        expect(error.aiOutputText).toBe('{"bad": true}');
      });

      it('inherits the 502 outcome status', () => {
        expect(new AiSummaryRetryableError('AI error').status).toBe(502);
      });

      it('handles no options gracefully', () => {
        const error = new AiSummaryRetryableError('simple');
        expect(error.aiUsage).toBeUndefined();
        expect(error.aiOutputText).toBeUndefined();
      });
    });

    it('ProviderApiRetryableError extends RetryableError', () => {
      const error = new ProviderApiRetryableError('API error');
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('API error');
    });

    it('ProviderApiNonRetryableError extends NonRetryableError', () => {
      const error = new ProviderApiNonRetryableError('Fatal API error');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe('Fatal API error');
    });

    it('OAuth2TokenRetryableError extends RetryableError', () => {
      const error = new OAuth2TokenRetryableError('Token refresh error');
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('Token refresh error');
    });

    it('OAuth2TokenNonRetryableError extends NonRetryableError', () => {
      const error = new OAuth2TokenNonRetryableError('Invalid refresh token');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe('Invalid refresh token');
    });
  });
});
