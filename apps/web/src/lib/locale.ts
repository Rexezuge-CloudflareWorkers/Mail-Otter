import { normalizeLanguage } from '../i18n';

export function resolveLocale(lng?: string | null): string {
  if (lng) return normalizeLanguage(lng);
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('mail-otter-lng');
    if (stored) return normalizeLanguage(stored);
  } catch {
    // Ignore storage errors.
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.language) return normalizeLanguage(navigator.language);
  } catch {
    // Ignore and fall through.
  }
  return 'en';
}

export function formatDateLocale(date: Date, lng?: string | null, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(resolveLocale(lng), options);
}

export function formatTimeLocale(date: Date, lng?: string | null, options?: Intl.DateTimeFormatOptions): string {
  return date.toLocaleTimeString(resolveLocale(lng), options);
}

export function formatNumberLocale(value: number, lng?: string | null, options?: Intl.NumberFormatOptions): string {
  const tag = resolveLocale(lng);
  return options === undefined ? value.toLocaleString(tag) : value.toLocaleString(tag, options);
}
