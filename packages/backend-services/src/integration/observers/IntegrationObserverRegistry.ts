import type { OutboundIntegrationType } from '@mail-otter/shared/model';
import type { IntegrationObserver } from './IntegrationObserver';
import { DiscordObserver } from './DiscordObserver';
import { SlackObserver } from './SlackObserver';
import { WebhookObserver } from './WebhookObserver';

const OBSERVERS: ReadonlyMap<OutboundIntegrationType, IntegrationObserver> = new Map<OutboundIntegrationType, IntegrationObserver>([
  ['slack', new SlackObserver()],
  ['discord', new DiscordObserver()],
  ['webhook', new WebhookObserver()],
]);

class IntegrationObserverRegistry {
  public static get(integrationType: string): IntegrationObserver | undefined {
    return OBSERVERS.get(integrationType as OutboundIntegrationType);
  }

  public static getObservers(): ReadonlyMap<OutboundIntegrationType, IntegrationObserver> {
    return OBSERVERS;
  }
}

export { IntegrationObserverRegistry };
