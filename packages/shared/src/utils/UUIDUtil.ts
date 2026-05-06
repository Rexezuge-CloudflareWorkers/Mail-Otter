class UUIDUtil {
  public static getRandomUUID(): string {
    return crypto.randomUUID();
  }
}

export { UUIDUtil };
