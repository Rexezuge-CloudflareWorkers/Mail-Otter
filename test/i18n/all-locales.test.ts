import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKEND_STRINGS, getBackendStrings } from '@mail-otter/shared/i18n';

const ALL_LOCALES = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'nl',
  'pt',
  'pl',
  'ja',
  'zh-CN',
  'zh-TW',
  'ko',
] as const;

function collectLeafKeys(value: unknown, prefix: string, out: string[]): void {
  if (typeof value === 'string') {
    out.push(prefix);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      collectLeafKeys(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
}

function leafKeys(strings: unknown): string[] {
  const out: string[] = [];
  collectLeafKeys(strings, '', out);
  return out.sort();
}

function leafValues(strings: unknown): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  const walk = (value: unknown, prefix: string): void => {
    if (typeof value === 'string') {
      entries.push({ key: prefix, value });
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, prefix ? `${prefix}.${key}` : key);
      }
    }
  };
  walk(strings, '');
  return entries;
}

describe('all locales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ships exactly the twelve supported locales', () => {
    expect(Object.keys(BACKEND_STRINGS).sort()).toEqual([...ALL_LOCALES].sort());
  });

  it('exposes the same string keys as English in every locale', () => {
    const englishKeys = leafKeys(getBackendStrings('en'));
    expect(englishKeys.length).toBeGreaterThan(0);
    for (const locale of ALL_LOCALES) {
      expect(leafKeys(getBackendStrings(locale)), `locale ${locale}`).toEqual(englishKeys);
    }
  });

  it('has no empty translations in any locale', () => {
    for (const locale of ALL_LOCALES) {
      for (const { key, value } of leafValues(getBackendStrings(locale))) {
        expect(value.length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps placeholder variables in sync with English', () => {
    const placeholderPattern = /\{[^}]+\}/g;
    const english = new Map(leafValues(getBackendStrings('en')).map((e) => [e.key, e.value]));
    for (const locale of ALL_LOCALES) {
      if (locale === 'en') continue;
      for (const { key, value } of leafValues(getBackendStrings(locale))) {
        const expected = [...(english.get(key) ?? '').matchAll(placeholderPattern)].map((m) => m[0]).sort();
        const actual = [...value.matchAll(placeholderPattern)].map((m) => m[0]).sort();
        expect(actual, `${locale}.${key}`).toEqual(expected);
      }
    }
  });

  it('falls back to English for null, undefined, and unknown locales', () => {
    const english = getBackendStrings('en');
    expect(getBackendStrings(null)).toBe(english);
    expect(getBackendStrings(undefined)).toBe(english);
    expect(getBackendStrings('xx')).toBe(english);
  });
});
