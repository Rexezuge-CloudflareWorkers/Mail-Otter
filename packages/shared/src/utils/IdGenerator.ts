interface IIdGenerator {
  randomUUID(): string;
}

class CryptoIdGenerator implements IIdGenerator {
  public randomUUID(): string {
    return crypto.randomUUID();
  }
}

class FixedIdGenerator implements IIdGenerator {
  private readonly queue: string[] = [];
  private counter = 0;

  constructor(ids: string | string[] = []) {
    const initial: string[] = Array.isArray(ids) ? ids : [ids];
    for (const id of initial) {
      if (id) this.queue.push(id);
    }
  }

  public queueId(id: string): void {
    this.queue.push(id);
  }

  public randomUUID(): string {
    const next: string | undefined = this.queue.shift();
    if (next !== undefined) return next;
    this.counter += 1;
    return `fixed-uuid-${this.counter.toString()}`;
  }
}

export { CryptoIdGenerator, FixedIdGenerator };
export type { IIdGenerator };
