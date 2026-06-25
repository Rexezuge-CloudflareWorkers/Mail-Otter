const WORKERS_AI_DAILY_LIMIT_CODES: ReadonlySet<string> = new Set<string>(['3036', '4006']);

class WorkersAiErrorUtil {
  public static isDailyFreeAllocationError(error: unknown): boolean {
    const values: string[] = this.collectErrorValues(error);
    const text: string = values.join(' ');
    if (/daily free allocation|10,?000 neurons|account limited/i.test(text)) return true;
    return values.some((value: string): boolean => WORKERS_AI_DAILY_LIMIT_CODES.has(value.trim()));
  }

  public static getDailyFreeAllocationMessage(): string {
    return 'Workers AI daily free allocation was exceeded.';
  }

  private static collectErrorValues(error: unknown, seen: WeakSet<object> = new WeakSet<object>(), depth = 0): string[] {
    if (error === null || error === undefined || depth > 6) return [];
    if (typeof error === 'string' || typeof error === 'number') return [String(error)];
    if (typeof error !== 'object') return [];
    if (seen.has(error)) return [];
    seen.add(error);

    const values: string[] = [];
    if (error instanceof Error) {
      values.push(error.name, error.message);
    }

    for (const value of Object.values(error as Record<string, unknown>)) {
      values.push(...this.collectErrorValues(value, seen, depth + 1));
    }
    return values;
  }
}

export { WorkersAiErrorUtil };
