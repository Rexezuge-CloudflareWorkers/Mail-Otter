class UIDUtility {
  public static getRandomUUID(): string {
    return crypto.randomUUID();
  }
}

export { UIDUtility as UUIDUtil };
