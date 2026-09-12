interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

/**
 * Opaque cursor value object. Centralizes the base64(JSON) codec so DAOs
 * stop hand-rolling `encodeCursor/parseCursor` pairs (7 duplicates).
 * Works in Workers (btoa/atob) and Node 24 (global btoa/atob).
 */
class Cursor {
  public static encode(value: unknown): string {
    return btoa(JSON.stringify(value));
  }

  public static decode<T>(cursor: string | undefined | null): T | undefined {
    if (!cursor) return undefined;
    try {
      return JSON.parse(atob(cursor)) as T;
    } catch {
      return undefined;
    }
  }

  public static page<T>(items: readonly T[], nextCursor?: string): Page<T> {
    return nextCursor ? { items, nextCursor } : { items };
  }
}

export { Cursor };
export type { Page };
