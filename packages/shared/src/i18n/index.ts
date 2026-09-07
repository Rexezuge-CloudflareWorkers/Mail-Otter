import { LocaleUtil, type SupportedLocale } from '../utils/LocaleUtil';
import type { BackendLocaleStrings } from './BackendStrings';
import { enStrings } from './locales/en';
import { deStrings } from './locales/de';
import { frStrings } from './locales/fr';
import { esStrings } from './locales/es';
import { itStrings } from './locales/it';
import { nlStrings } from './locales/nl';
import { ptStrings } from './locales/pt';
import { plStrings } from './locales/pl';
import { jaStrings } from './locales/ja';
import { zhCNStrings } from './locales/zh-CN';
import { zhTWStrings } from './locales/zh-TW';
import { koStrings } from './locales/ko';

const BACKEND_STRINGS: Record<SupportedLocale, BackendLocaleStrings> = {
  en: enStrings,
  de: deStrings,
  fr: frStrings,
  es: esStrings,
  it: itStrings,
  nl: nlStrings,
  pt: ptStrings,
  pl: plStrings,
  ja: jaStrings,
  'zh-CN': zhCNStrings,
  'zh-TW': zhTWStrings,
  ko: koStrings,
};

function getBackendStrings(locale: string | null | undefined): BackendLocaleStrings {
  return BACKEND_STRINGS[LocaleUtil.normalize(locale)];
}

export { BACKEND_STRINGS, getBackendStrings };
export * from './BackendStrings';
