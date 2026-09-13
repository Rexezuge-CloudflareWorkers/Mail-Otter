import type { EmailActionType } from '@mail-otter/shared/constants';
import type { IActionHandler, HandlerMap } from './IActionHandler';

/**
 * Injectable (non-static) command registry for email action handlers.
 *
 * The static `ActionHandlerRegistry` holds a module-level singleton map which
 * cannot be substituted in tests. New code should accept this class via
 * constructor injection; `withDefaults()` preserves production wiring and
 * `withOverrides()` enables hermetic unit tests.
 *
 * Mirrors `InjectableEmailProviderRegistry` / `InjectableIntegrationObserverRegistry`.
 */
class InjectableActionHandlerRegistry {
  private readonly handlers: HandlerMap;

  constructor(handlers: HandlerMap) {
    this.handlers = handlers;
  }

  public static withDefaults(defaults: HandlerMap): InjectableActionHandlerRegistry {
    return new InjectableActionHandlerRegistry(defaults);
  }

  public static withOverrides(
    defaults: HandlerMap,
    overrides: ReadonlyMap<string, IActionHandler> | Readonly<Record<string, IActionHandler>>,
  ): InjectableActionHandlerRegistry {
    const merged = new Map(defaults as Map<EmailActionType, IActionHandler>);
    const entries: Iterable<readonly [string, IActionHandler]> =
      overrides instanceof Map ? overrides.entries() : Object.entries(overrides);
    for (const [key, handler] of entries) {
      merged.set(key as EmailActionType, handler);
    }
    return new InjectableActionHandlerRegistry(merged);
  }

  public get(actionType: string): IActionHandler | undefined {
    return this.handlers.get(actionType as EmailActionType);
  }

  public getHandlers(): HandlerMap {
    return this.handlers;
  }
}

export { InjectableActionHandlerRegistry };
