import type { SenderDomainFilters } from '@mail-otter/shared/model';

class SenderFilterUtil {
  public static extractEmailAddress(from: string): string {
    const lt = from.indexOf('<');
    const gt = lt !== -1 ? from.indexOf('>', lt + 1) : -1;
    if (lt !== -1 && gt !== -1) {
      return from.slice(lt + 1, gt).toLowerCase().trim();
    }
    return from.toLowerCase().trim();
  }

  public static matchesPattern(emailAddress: string, pattern: string): boolean {
    const p = pattern.toLowerCase().trim();
    if (p.startsWith('@')) {
      return emailAddress.endsWith(p);
    }
    return emailAddress === p;
  }

  public static shouldSkip(
    from: string,
    filters: SenderDomainFilters,
  ): { skip: false } | { skip: true; reason: string } {
    const address = SenderFilterUtil.extractEmailAddress(from);

    if (filters.excludeRules.length > 0) {
      const excluded = filters.excludeRules.some((r) => SenderFilterUtil.matchesPattern(address, r));
      if (excluded) {
        return { skip: true, reason: 'Sender matches application exclude filter rules.' };
      }
    }

    if (filters.includeRules.length > 0) {
      const included = filters.includeRules.some((r) => SenderFilterUtil.matchesPattern(address, r));
      if (!included) {
        return { skip: true, reason: 'Sender does not match application include filter rules.' };
      }
    }

    return { skip: false };
  }
}

export { SenderFilterUtil };
