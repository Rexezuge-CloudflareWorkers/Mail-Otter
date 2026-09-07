import { DEFAULT_LOCALE, LocaleUtil, SUPPORTED_LOCALES } from '@mail-otter/shared/utils';
import { describe, expect, it } from 'vitest';

describe('LocaleUtil', () => {
  describe('isSupported', () => {
    it('accepts supported BCP 47 tags', () => {
      for (const locale of SUPPORTED_LOCALES) {
        expect(LocaleUtil.isSupported(locale)).toBe(true);
      }
    });

    it('rejects unsupported, empty, or non-string values', () => {
      expect(LocaleUtil.isSupported('xx')).toBe(false);
      expect(LocaleUtil.isSupported('')).toBe(false);
      expect(LocaleUtil.isSupported(null)).toBe(false);
      expect(LocaleUtil.isSupported(undefined)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('returns supported locales in canonical form', () => {
      expect(LocaleUtil.normalize('de')).toBe('de');
      expect(LocaleUtil.normalize('zh-CN')).toBe('zh-CN');
      expect(LocaleUtil.normalize('zh-cn')).toBe('zh-CN');
      expect(LocaleUtil.normalize('zh_CN')).toBe('zh-CN');
      expect(LocaleUtil.normalize('pt-BR')).toBe('pt');
    });

    it('falls back to Chinese Simplified for bare zh', () => {
      expect(LocaleUtil.normalize('zh')).toBe('zh-CN');
    });

    it('falls back to English for unsupported or missing input', () => {
      expect(LocaleUtil.normalize('xx-YY')).toBe(DEFAULT_LOCALE);
      expect(LocaleUtil.normalize('garbage')).toBe('en');
      expect(LocaleUtil.normalize(null)).toBe('en');
      expect(LocaleUtil.normalize(undefined)).toBe('en');
    });
  });

  describe('negotiate', () => {
    it('prefers the primary locale and falls back to the secondary', () => {
      expect(LocaleUtil.negotiate('fr', 'de')).toBe('fr');
      expect(LocaleUtil.negotiate(null, 'ja')).toBe('ja');
      expect(LocaleUtil.negotiate(null, null)).toBe('en');
    });
  });

  describe('displayName', () => {
    it('returns native names for supported locales', () => {
      expect(LocaleUtil.displayName('de')).toBe('Deutsch');
      expect(LocaleUtil.displayName('ja')).toBe('日本語');
      expect(LocaleUtil.displayName('zh-TW')).toBe('繁體中文');
    });

    it('falls back to English for unknown input', () => {
      expect(LocaleUtil.displayName('xx')).toBe('English');
    });
  });
});
