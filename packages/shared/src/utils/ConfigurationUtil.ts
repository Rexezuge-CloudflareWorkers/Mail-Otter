class ConfigurationUtil {
  public static getPositiveInteger(value: string | undefined, fallback: string): number {
    const parsed: number = Number(value ?? fallback);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : Number(fallback);
  }
}

export { ConfigurationUtil };
