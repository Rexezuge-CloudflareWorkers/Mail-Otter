import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@mail-otter/backend-errors';
import { DatabaseError } from '@mail-otter/backend-errors';
import { ForbiddenError } from '@mail-otter/backend-errors';
import { InternalServerError, DefaultInternalServerError } from '@mail-otter/backend-errors';
import { MethodNotAllowedError } from '@mail-otter/backend-errors';
import { UnauthorizedError } from '@mail-otter/backend-errors';
import { NonRetryableError } from '@mail-otter/backend-errors';
import { RetryableError } from '@mail-otter/backend-errors';
import {
  AiSummaryRetryableError,
  OAuth2TokenNonRetryableError,
  OAuth2TokenRetryableError,
  ProviderApiNonRetryableError,
  ProviderApiRetryableError,
} from '@mail-otter/backend-errors';

describe('Error Classes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('BadRequestError', () => {
    it('uses default message when none provided', () => {
      const error = new BadRequestError();
      expect(error.getErrorCode()).toBe(400);
      expect(error.getErrorType()).toBe('BadRequest');
      expect(error.getErrorMessage()).toBe('The request could not be understood or was missing required parameters.');
      expect(error).toBeInstanceOf(BadRequestError);
    });

    it('uses custom message when provided', () => {
      const error = new BadRequestError('Custom error');
      expect(error.getErrorMessage()).toBe('Custom error');
    });
  });

  describe('UnauthorizedError', () => {
    it('uses default message when none provided', () => {
      const error = new UnauthorizedError();
      expect(error.getErrorCode()).toBe(401);
      expect(error.getErrorType()).toBe('Unauthorized');
      expect(error.getErrorMessage()).toBe('Authentication is required and has failed or has not yet been provided.');
    });

    it('uses custom message when provided', () => {
      const error = new UnauthorizedError('Custom error');
      expect(error.getErrorMessage()).toBe('Custom error');
    });
  });

  describe('ForbiddenError', () => {
    it('uses default message when none provided', () => {
      const error = new ForbiddenError();
      expect(error.getErrorCode()).toBe(403);
      expect(error.getErrorType()).toBe('Forbidden');
      expect(error.getErrorMessage()).toBe('You do not have permission to perform this action.');
    });

    it('uses custom message when provided', () => {
      const error = new ForbiddenError('Custom error');
      expect(error.getErrorMessage()).toBe('Custom error');
    });
  });

  describe('MethodNotAllowedError', () => {
    it('uses default message when none provided', () => {
      const error = new MethodNotAllowedError();
      expect(error.getErrorCode()).toBe(405);
      expect(error.getErrorType()).toBe('MethodNotAllowed');
      expect(error.getErrorMessage()).toBe('The requested method is not allowed for this resource.');
    });

    it('uses custom message when provided', () => {
      const error = new MethodNotAllowedError('Custom error');
      expect(error.getErrorMessage()).toBe('Custom error');
    });
  });

  describe('InternalServerError', () => {
    it('uses default message when none provided', () => {
      const error = new InternalServerError();
      expect(error.getErrorCode()).toBe(500);
      expect(error.getErrorType()).toBe('InternalServerError');
      expect(error.getErrorMessage()).toBe('The server encountered an internal error and was unable to complete your request.');
    });

    it('uses custom message when provided', () => {
      const error = new InternalServerError('Custom error');
      expect(error.getErrorMessage()).toBe('Custom error');
    });
  });

  describe('DefaultInternalServerError', () => {
    it('is a singleton instance with default message', () => {
      expect(DefaultInternalServerError.getErrorCode()).toBe(500);
      expect(DefaultInternalServerError.getErrorType()).toBe('InternalServerError');
      expect(DefaultInternalServerError.getErrorMessage()).toBe('The server encountered an internal error and was unable to complete your request.');
    });
  });

  describe('DatabaseError', () => {
    it('extends InternalServerError with default message', () => {
      const error = new DatabaseError();
      expect(error.getErrorCode()).toBe(500);
      expect(error.getErrorType()).toBe('DatabaseError');
      expect(error.getErrorMessage()).toBe('The system encountered an unexpected problem while accessing the database.');
      expect(error.retryable).toBe(false);
    });

    it('is retryable when set to true', () => {
      const error = new DatabaseError('DB error', true);
      expect(error.retryable).toBe(true);
      expect(error.getErrorMessage()).toBe('DB error');
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
  });

  describe('RetryableError', () => {
    it('has retryable set to true', () => {
      const error = new RetryableError('Transient error');
      expect(error.retryable).toBe(true);
      expect(error.message).toBe('Transient error');
      expect(error.name).toBe('RetryableError');
    });
  });

  describe('EmailProcessingError subclasses', () => {
    describe('AiSummaryRetryableError', () => {
      it('extends RetryableError with optional usage data', () => {
        const usage = { promptTokens: 100, completionTokens: 50 };
        const error = new AiSummaryRetryableError('AI error', { aiUsage: usage, aiOutputText: '{"bad": true}' });
        expect(error.retryable).toBe(true);
        expect(error.message).toBe('AI error');
        expect(error.aiUsage).toEqual(usage);
        expect(error.aiOutputText).toBe('{"bad": true}');
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
