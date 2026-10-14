/**
 * The barrel every consumer-side module imports.
 *
 * Most of these implementations now live in `@rexezuge/shared` — the converged
 * copy, one per repo instead of nine. This file is the seam between the two: it
 * re-exports the kit's symbols under their existing names so the ~90 import
 * sites across this repo keep working, and keeps only the handful the kit
 * deliberately does not ship.
 *
 * That last part is the point of the file rather than a convenience. The kit
 * converges platform-generic utilities; it does not carry product-specific
 * ones. `BaseUrlUtil` derives the inbound request's own origin, `ErrorLogging`
 * implements this repo's credential-redaction logging policy, and
 * `CalendarSyncWindow` is digest logic — none of which belongs in a shared kit,
 * and all of which would be silently dropped by a wholesale `export *` onto the
 * package root. They stay here, and the drift that a second copy causes is now
 * impossible for the seven symbols that did converge, because there is only one
 * copy of each and it is not ours.
 */

// Converged: `@rexezuge/shared` owns these, and a fix to any of them lands for
// every consumer at once rather than needing nine migrations.
export { CryptoUtil, CursorCodec, ErrorSanitizationUtil, LocaleUtil, TimestampUtil, TimeZoneUtil, UUIDUtil } from '@rexezuge/shared';
export { DEFAULT_LOCALE, DEFAULT_TIME_ZONE, LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES, FixedClock, SystemClock } from '@rexezuge/shared';
export type { Clock, Page, SupportedLocale } from '@rexezuge/shared';

// Product-local: no kit counterpart, and none should exist.
export * from './BaseUrlUtil';
export * from './CalendarSyncWindow';
export * from './ErrorLogging';
export * from './Logger';
