import { LocaleUtil } from '../utils/LocaleUtil';
import type { BackendLocaleStrings } from './BackendStrings';
import { getBackendStrings } from './index';

function resolveLocalizedStrings(locale?: string | null, fallback?: string | null): BackendLocaleStrings {
  return getBackendStrings(LocaleUtil.negotiate(locale, fallback));
}

export { resolveLocalizedStrings };
