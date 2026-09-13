import { describe, expect, it } from 'vitest';
import { ActionHandlerRegistry } from '@mail-otter/backend-services/action/handlers/ActionHandlerRegistry';
import { InjectableActionHandlerRegistry } from '@mail-otter/backend-services/action/handlers/InjectableActionHandlerRegistry';
import { IntegrationObserverRegistry } from '@mail-otter/backend-services/integration/observers/IntegrationObserverRegistry';
import { InjectableIntegrationObserverRegistry } from '@mail-otter/backend-services/integration/observers/InjectableIntegrationObserverRegistry';

describe('InjectableActionHandlerRegistry', () => {
  it('withDefaults() exposes the same handlers as the static registry', () => {
    const registry = InjectableActionHandlerRegistry.withDefaults(ActionHandlerRegistry.getHandlers());
    expect(registry.get('external-open-link')).toBe(ActionHandlerRegistry.get('external-open-link'));
    expect(registry.getHandlers().size).toBe(ActionHandlerRegistry.getHandlers().size);
  });

  it('withOverrides() substitutes handlers for hermetic tests', () => {
    const stub = { execute: async () => ({ summary: 'stub' }) };
    const registry = InjectableActionHandlerRegistry.withDefaults(ActionHandlerRegistry.getHandlers()).constructor as never;
    void registry;
    const overridden = InjectableActionHandlerRegistry.withOverrides(ActionHandlerRegistry.getHandlers(), {
      'manual-todo': stub as never,
    });
    expect(overridden.get('manual-todo')).toBe(stub);
    expect(overridden.get('external-open-link')).toBe(ActionHandlerRegistry.get('external-open-link'));
  });

  it('returns undefined for unknown action types', () => {
    const registry = InjectableActionHandlerRegistry.withDefaults(ActionHandlerRegistry.getHandlers());
    expect(registry.get('nope')).toBeUndefined();
  });
});

describe('InjectableIntegrationObserverRegistry', () => {
  it('withDefaults() matches the static registry', () => {
    const registry = InjectableIntegrationObserverRegistry.withDefaults();
    expect(registry.get('slack')).toBe(IntegrationObserverRegistry.get('slack'));
    expect(registry.get('discord')).toBe(IntegrationObserverRegistry.get('discord'));
    expect(registry.get('webhook')).toBe(IntegrationObserverRegistry.get('webhook'));
    expect(registry.getObservers().size).toBe(3);
  });

  it('withOverrides() substitutes observers for hermetic tests', () => {
    const stub = { integrationType: 'slack', dispatch: async () => ({ status: 'success', httpStatus: 200, errorMessage: null }) } as never;
    const registry = InjectableIntegrationObserverRegistry.withOverrides({ slack: stub as never });
    expect(registry.get('slack')).toBe(stub);
    expect(registry.get('discord')).toBe(IntegrationObserverRegistry.get('discord'));
  });

  it('returns undefined for unknown integration types', () => {
    expect(InjectableIntegrationObserverRegistry.withDefaults().get('nope')).toBeUndefined();
  });
});
