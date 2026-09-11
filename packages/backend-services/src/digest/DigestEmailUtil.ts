import { DigestEmailBuilder } from './DigestEmailBuilder';
import type { DigestSections } from './DigestEmailBuilder';

// Compatibility facade: DigestEmailBuilder owns buildHtml/sections payload
// construction; this util delegates so existing imports keep working.
// New code should import DigestEmailBuilder directly.
class DigestEmailUtil {
  public static buildSubject(date: Date, timeZone: string, locale?: string | null): string {
    return DigestEmailBuilder.buildSubject(date, timeZone, locale);
  }

  public static buildHtml(sections: DigestSections, enabledSections: string[], locale?: string | null): string {
    return DigestEmailBuilder.buildHtml(sections, enabledSections, locale);
  }

  public static hasContent(sections: DigestSections, enabledSections: string[]): boolean {
    return DigestEmailBuilder.hasContent(sections, enabledSections);
  }
}

export { DigestEmailUtil };
export type { DigestSections } from './DigestEmailBuilder';
