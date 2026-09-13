import type { OutboundIntegrationType } from '@mail-otter/shared/model';
import type { IntegrationObserver } from './IntegrationObserver';
import { DiscordObserver } from './DiscordObserver';
import { SlackObserver } from './SlackObserver';
import { WebhookObserver } from './WebhookObserver';
import { IntegrationObserverRegistry } from './IntegrationObserverRegistry';

/**
 * Injectable (non-static) observer registry for outbound integrations.
 *
 * The static `IntegrationObserverRegistry` holds module-level singletons which
 * cannot be substituted in tests. New code should accept this class via
 * constructor injection; `withDefaults()` preserves production wiring and
 * `withOverrides()` enables hermetic unit tests.
 *
 * Mirrors `InjectableEmailProviderRegistry`.
 */
class InjectableIntegrationObserverRegistry {
  private readonly observers: ReadonlyMap<OutboundIntegrationType, IntegrationObserver>;

  constructor(observers?: ReadonlyMap<OutboundIntegrationType, IntegrationObserver>) {
    this.observers =
      observers ??
      new Map<OutboundIntegrationType, IntegrationObserver>([
        ['slack', new SlackObserver()],
        ['discord', new DiscordObserver()],
        ['webhook', new WebhookObserver()],
      ]);
  }

  public static withDefaults(): InjectableIntegrationObserverRegistry {
    // Share static registry instances so `withDefaults()` is identical to
    // `IntegrationObserverRegistry.get(...)` (single source of observers).
    return new this(IntegrationObserverRegistry.getObservers());
  }

  public static withOverrides(
    overrides: ReadonlyMap<string, IntegrationObserver> | Readonly<Record<string, IntegrationObserver>>,
  ): InjectableIntegrationObserverRegistry {
    const base = this.withDefaults().observers;
    const merged = new Map(base);
    const entries: Iterable<readonly [string, IntegrationObserver]> =
      overrides instanceof Map ? overrides.entries() : Object.entries(overrides);
    for (const [key, observer] of entries) {
      merged.set(key as OutboundIntegrationType, observer);
    }
    return new this(merged);
  }

  public get(integrationType: string): IntegrationObserver | undefined {
    return this.observers.get(integrationType as OutboundIntegrationType);
  }

  public getObservers(): ReadonlyMap<OutboundIntegrationType, IntegrationObserver> {
    return this.observers;
  }
}

export { InjectableIntegrationObserverRegistry };
