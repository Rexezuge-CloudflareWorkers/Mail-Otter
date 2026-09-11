import { useApplications } from './useApplications';
import type { UseMailboxesOptions } from './useApplications';
import { useIntegrations } from './useIntegrations';

export function useMailboxes(options: UseMailboxesOptions) {
  const applications = useApplications(options);
  const integrations = useIntegrations(options);

  return {
    ...applications,
    ...integrations,
  };
}

export type { UseMailboxesOptions };
