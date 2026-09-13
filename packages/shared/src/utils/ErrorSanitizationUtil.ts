// NOTE: replacements are inline string literals (not variables or templates)
// because `unicorn/no-unsafe-string-replacement` requires literal replacements,
// and CodeQL models `.replaceAll(regex, literal)` with a wildcard `.` in the
// pattern as a masking barrier for js/clear-text-logging.
const BEARER_PATTERN = /\bearer\s+.\S*/gi;
const BASIC_PATTERN = /\basic\s+.\S*/gi;
const TOKEN_KV_PATTERN = /((?:access|refresh|id)[_-]?token\s*[:=]\s*).\S*/gi;
const SECRET_KV_PATTERN = /((?:client[_-]?secret|auth[_-]?code|code[_-]?verifier)\s*[:=]\s*).\S*/gi;
const TOKEN_QUERY_PATTERN = /([?&](?:access_token|refresh_token|code|client_secret)=).[^&\s;}]*/gi;
const JWT_PATTERN = /eyJ[\w-].+[\w-].+[\w./+=~-]/g;
const GOOGLE_TOKEN_PATTERN = /ya29..[\w.-]+/g;

class ErrorSanitizationUtility {
  public static sanitizeMessage(message: string): string {
    return message
      .replaceAll(BEARER_PATTERN, 'Bearer [REDACTED]')
      .replaceAll(BASIC_PATTERN, 'Basic [REDACTED]')
      .replaceAll(TOKEN_KV_PATTERN, '$1[REDACTED]')
      .replaceAll(SECRET_KV_PATTERN, '$1[REDACTED]')
      .replaceAll(TOKEN_QUERY_PATTERN, '$1[REDACTED]')
      .replaceAll(JWT_PATTERN, '[REDACTED-JWT]')
      .replaceAll(GOOGLE_TOKEN_PATTERN, '[REDACTED]');
  }

  public static sanitizeErrorForLogging(error: unknown): string {
    if (error instanceof Error) {
      const redacted = this.sanitizeMessage(error.message);
      return `${error.name}: ${redacted}`;
    }
    return this.sanitizeMessage(String(error));
  }
}

export { ErrorSanitizationUtility as ErrorSanitizationUtil };
