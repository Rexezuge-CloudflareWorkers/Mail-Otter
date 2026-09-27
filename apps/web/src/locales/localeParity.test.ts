import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGES } from '@/i18n';

type Json = { [key: string]: JsonValue };
type JsonValue = string | Json;

// Resolved by Vite rather than by `node:fs`: under the jsdom environment
// `import.meta.url` is an http URL, so a file-relative read is not portable.
const TRANSLATIONS = import.meta.glob<{ default: Json }>('./*/translation.json', { eager: true });

const readLocale = (tag: string): Json => {
  const module = TRANSLATIONS[`./${tag}/translation.json`];
  if (!module) throw new Error(`missing translation file for ${tag}`);
  return module.default;
};

/**
 * Dotted leaf paths, e.g. `mailboxes.title`.
 */
const leafKeys = (value: Json, prefix = ''): string[] => {
  const keys: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') keys.push(path);
    else if (child) keys.push(...leafKeys(child, path));
  }
  return keys.sort();
};

const interpolationVars = (value: string): string[] =>
  // eslint-disable-next-line unicorn/prefer-string-replace-all -- tsconfig lib is ES2020
  (value.match(/\{\{[^{}]+\}\}/g) ?? []).map((token) => token.replace(/[{}]/g, '')).sort();

/**
 * Locale parity for the SPA.
 *
 * The backend has `test/i18n/all-locales.test.ts`, which asserts every locale
 * carries the same keys and the same `{{placeholder}}` set as English. The
 * frontend translation files had no equivalent, so a key added to `en` could
 * ship untranslated and render as the raw key at runtime.
 */
describe('SPA locale parity', () => {
  const english = readLocale('en');
  const englishKeys = leafKeys(english);

  it('ships exactly the supported locales', () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(12);
    for (const tag of SUPPORTED_LANGUAGES) {
      expect(() => readLocale(tag), `missing translation file for ${tag}`).not.toThrow();
    }
  });

  it('has a non-trivial English base', () => {
    expect(englishKeys.length).toBeGreaterThan(50);
  });

  it.each([...SUPPORTED_LANGUAGES])('%s defines every English key', (tag) => {
    const missing = englishKeys.filter((key) => !leafKeys(readLocale(tag)).includes(key));
    expect(missing, `${tag} is missing keys`).toEqual([]);
  });

  it.each([...SUPPORTED_LANGUAGES])('%s introduces no keys English lacks', (tag) => {
    const extra = leafKeys(readLocale(tag)).filter((key) => !englishKeys.includes(key));
    expect(extra, `${tag} has keys English does not`).toEqual([]);
  });

  it.each([...SUPPORTED_LANGUAGES])('%s keeps the same interpolation placeholders as English', (tag) => {
    const locale = readLocale(tag);
    const lookup = (source: Json, path: string): JsonValue | undefined =>
      path.split('.').reduce<JsonValue | undefined>((node, part) => (typeof node === 'string' ? undefined : node?.[part]), source);

    const mismatched = englishKeys.filter((key) => {
      const base = lookup(english, key);
      const translated = lookup(locale, key);
      return (
        typeof base === 'string' &&
        typeof translated === 'string' &&
        interpolationVars(base).join(',') !== interpolationVars(translated).join(',')
      );
    });
    expect(mismatched, `${tag} has placeholder mismatches`).toEqual([]);
  });

  it.each([...SUPPORTED_LANGUAGES])('%s has no empty translation', (tag) => {
    const walk = (value: Json, prefix = ''): string[] =>
      Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof child === 'string') return child.trim() ? [] : [path];
        return child ? walk(child, path) : [];
      });
    expect(walk(readLocale(tag)), `${tag} has blank strings`).toEqual([]);
  });
});
