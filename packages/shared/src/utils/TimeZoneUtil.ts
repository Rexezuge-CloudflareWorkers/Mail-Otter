const DEFAULT_TIME_ZONE = 'UTC';

const WALL_CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

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

  /**
   * Unix seconds of local midnight for the calendar day containing `now`.
   *
   * Two passes are needed because the zone offset depends on the instant: read
   * the wall clock in the target zone, treat that as UTC to derive the offset,
   * then re-anchor local midnight with the offset. The offset is sampled at
   * `now` rather than at the target midnight, which is exact except within a
   * few hours of a DST transition — irrelevant for a 24-hour window.
   *
   * Do NOT build this with `new Date('YYYY-MM-DDT00:00:00')`. A date-time
   * string with no zone designator parses in the *runtime's* zone, and the
   * Workers runtime is always UTC, which silently ignores `timeZone` entirely.
   *
   * An unknown zone falls back to UTC rather than throwing.
   */
  public static getLocalDayStartUnixSeconds(now: Date, timeZone: string | null | undefined): number {
    const zone: string = this.normalize(timeZone);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, ...WALL_CLOCK_FORMAT }).formatToParts(now);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '0';
    const year = Number(part('year'));
    const month = Number(part('month'));
    const day = Number(part('day'));
    // Some ICU builds report midnight as hour 24 under `hour12: false`.
    const hour = Number(part('hour')) % 24;
    const minute = Number(part('minute'));
    const second = Number(part('second'));
    const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const zoneOffsetMs = wallClockAsUtcMs - now.getTime();
    return Math.floor((Date.UTC(year, month - 1, day, 0, 0, 0) - zoneOffsetMs) / 1000);
  }
}

export { TimeZoneUtility as TimeZoneUtil, DEFAULT_TIME_ZONE };
