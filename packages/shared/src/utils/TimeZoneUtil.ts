const DEFAULT_TIME_ZONE = 'UTC';

class TimeZoneUtility {
  public static isValid(timeZone: string | null | undefined): boolean {
    if (!timeZone || typeof timeZone !== 'string') return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }

  public static normalize(timeZone: string | null | undefined): string {
    return this.isValid(timeZone) ? (timeZone as string).trim() : DEFAULT_TIME_ZONE;
  }

  public static todayInZone(timeZone: string | null | undefined, now: Date = new Date()): string {
    const zone: string = this.normalize(timeZone);
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

export { TimeZoneUtility as TimeZoneUtil, DEFAULT_TIME_ZONE };
