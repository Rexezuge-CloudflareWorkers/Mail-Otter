import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBackendStrings, resolveLocalizedStrings } from '@mail-otter/shared/i18n';

describe('resolveLocalizedStrings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves the requested locale', () => {
    expect(resolveLocalizedStrings('de')).toBe(getBackendStrings('de'));
    expect(resolveLocalizedStrings('ja')).toBe(getBackendStrings('ja'));
  });

  it('falls back to English for missing locales', () => {
    expect(resolveLocalizedStrings(null)).toBe(getBackendStrings('en'));
    expect(resolveLocalizedStrings(undefined)).toBe(getBackendStrings('en'));
  });

  it('negotiates the fallback locale when the preferred one is unsupported', () => {
    expect(resolveLocalizedStrings('xx', 'fr')).toBe(getBackendStrings('fr'));
  });

  it('prefers the requested locale over the fallback', () => {
    expect(resolveLocalizedStrings('es', 'fr')).toBe(getBackendStrings('es'));
  });
});
