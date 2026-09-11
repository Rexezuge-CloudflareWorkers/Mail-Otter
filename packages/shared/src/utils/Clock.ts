interface IClock {
  nowMs(): number;
}

class SystemClock implements IClock {
  public nowMs(): number {
    return Date.now();
  }
}

class FixedClock implements IClock {
  private currentMs: number;

  constructor(initialNowMs = 0) {
    this.currentMs = initialNowMs;
  }

  public nowMs(): number {
    return this.currentMs;
  }

  public setNowMs(valueMs: number): void {
    this.currentMs = valueMs;
  }

  public advanceByMs(deltaMs: number): void {
    this.currentMs += deltaMs;
  }
}

export { FixedClock, SystemClock };
export type { IClock };
