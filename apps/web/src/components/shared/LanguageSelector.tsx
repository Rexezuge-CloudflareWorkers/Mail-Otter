import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '../../i18n';

const NATIVE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  nl: 'Nederlands',
  pt: 'Português',
  pl: 'Polski',
  ja: '日本語',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ko: '한국어',
};

export function LanguageSelector({
  value,
  onChange,
  disabled,
}: {
  value?: string;
  onChange: (lng: string) => void;
  disabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const unknownLabel = t('header.unknownLanguage', 'Unknown');
  if (value === 'unknown') {
    return (
      <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <span className="sr-only">{t('header.selectLanguage', 'Select Language')}</span>
        <select
          aria-label={t('header.selectLanguage', 'Select Language')}
          value="unknown"
          disabled
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          <option value="unknown">{unknownLabel}</option>
        </select>
      </label>
    );
  }
  const current = normalizeLanguage(value ?? i18n.resolvedLanguage ?? i18n.language);
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
      <span className="sr-only">{t('header.selectLanguage', 'Select Language')}</span>
      <select
        aria-label={t('header.selectLanguage', 'Select Language')}
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)] text-sm px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {NATIVE_NAMES[lng] ?? lng}
          </option>
        ))}
      </select>
    </label>
  );
}
