type Factory<T> = (container: Container) => T;

type Token<_T = unknown> = string | symbol;

/**
 * Minimal dependency-injection container (Factory + Singleton scopes).
 *
 * Replaces the previous convention of `new XDAO(db)` / `new Service(env)`
 * scattered across 40+ call sites. Services declare constructor
 * dependencies on interfaces; composition roots (API worker, cron worker,
 * tests) wire concrete implementations once.
 */
class Container {
  private readonly factories = new Map<Token<unknown>, Factory<unknown>>();
  private readonly singletons = new Map<Token<unknown>, unknown>();

  public bind<T>(token: Token<T>, factory: Factory<T>): this {
    this.factories.set(token, factory);
    return this;
  }

  public bindValue<T>(token: Token<T>, value: T): this {
    this.singletons.set(token, value);
    return this;
  }

  public has<T>(token: Token<T>): boolean {
    return this.singletons.has(token) || this.factories.has(token);
  }

  public get<T>(token: Token<T>): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`DI container has no binding for token: ${String(token)}`);
    }
    const instance = (factory as Factory<T>)(this);
    this.singletons.set(token, instance);
    return instance;
  }

  /**
  Resolve without memoizing — for request-scoped objects.
  */
  public resolve<T>(token: Token<T>): T {
    const factory = this.factories.get(token);
    if (!factory) {
      return this.get(token);
    }
    return (factory as Factory<T>)(this);
  }

  public createChild(): Container {
    const child = new Container();
    for (const [token, value] of this.singletons) {
      child.bindValue(token, value);
    }
    for (const [token, factory] of this.factories) {
      child.bind(token, factory);
    }
    return child;
  }
}

export { Container };
export type { Factory, Token };
