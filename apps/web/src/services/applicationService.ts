import type { ConnectedApplication, DigestConfig, EmailProcessingRule, IntegrationDeliveryLog, OutboundIntegration, OutboundIntegrationType, SenderDomainFilters } from '../../components/types';
import { apiFetch, readJson } from '../../components/utils';
import type { ApplicationFormState } from '../components/mailboxes/MailboxForm';

export async function loadApplications(): Promise<{ applications: ConnectedApplication[] }> {
  return readJson<{ applications: ConnectedApplication[] }>(await apiFetch('/user/applications'));
}

export async function saveApplication(form: ApplicationFormState): Promise<{ application: ConnectedApplication }> {
  const isImapPassword = form.connectionMethod === 'imap-password';
  const payload = {
    applicationId: form.applicationId,
    displayName: form.displayName,
    providerId: form.providerId,
    connectionMethod: form.connectionMethod,
    ...(form.clientId && !isImapPassword && { clientId: form.clientId }),
    ...(form.clientSecret && !isImapPassword && { clientSecret: form.clientSecret }),
    enabledFeatures: form.enabledFeatures,
    timeZone: form.timeZone,
    ...((form.providerId === 'google-gmail') && { gmailPubsubTopicName: form.gmailPubsubTopicName }),
    ...(form.imapHost && { imapHost: form.imapHost }),
    ...(form.imapPort && { imapPort: Number(form.imapPort) }),
    ...(form.imapUsername && { imapUsername: form.imapUsername }),
    ...(form.imapPassword && isImapPassword && { imapPassword: form.imapPassword }),
    ...(form.smtpHost && { smtpHost: form.smtpHost }),
    ...(form.smtpPort && { smtpPort: Number(form.smtpPort) }),
  };
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application', {
      method: form.applicationId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
}

export async function deleteApplication(applicationId: string): Promise<void> {
  await readJson<{ success: boolean }>(
    await apiFetch('/user/application', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    }),
  );
}

export async function startOAuth2(applicationId: string): Promise<{ authorizationUrl: string }> {
  return readJson<{ authorizationUrl: string }>(
    await apiFetch('/user/application/oauth2/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    }),
  );
}

export async function startWatch(applicationId: string): Promise<{ message: string; webhookUrl: string }> {
  return readJson<{ message: string; webhookUrl: string }>(
    await apiFetch('/user/application/watch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    }),
  );
}

export async function stopWatch(applicationId: string): Promise<{ message: string }> {
  return readJson<{ message: string }>(
    await apiFetch('/user/application/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    }),
  );
}

export async function updateContextIndexing(
  applicationId: string,
  contextIndexingEnabled: boolean,
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, contextIndexingEnabled }),
    }),
  );
}

export async function updateRagRetrieval(
  applicationId: string,
  ragRetrievalEnabled: boolean,
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, ragRetrievalEnabled }),
    }),
  );
}

export async function updateAttachmentVisionEnabled(
  applicationId: string,
  attachmentVisionEnabled: boolean,
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, attachmentVisionEnabled }),
    }),
  );
}

export async function updateMaxContextDocuments(
  applicationId: string,
  maxContextDocuments: number | null,
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/context', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, maxContextDocuments }),
    }),
  );
}

export async function loadFolders(applicationId: string): Promise<{ folders: Array<{ id: string; name: string }> }> {
  return readJson<{ folders: Array<{ id: string; name: string }> }>(
    await apiFetch(`/user/application/folders?applicationId=${encodeURIComponent(applicationId)}`),
  );
}

export async function updateWatchedFolderIds(
  applicationId: string,
  folderIds: string[] | null,
  availableFolders: Array<{ id: string; name: string }> | null,
): Promise<{ application: ConnectedApplication }> {
  const folderNames: Record<string, string> = {};
  if (folderIds && availableFolders) {
    for (const id of folderIds) {
      const folder = availableFolders.find((f) => f.id === id);
      if (folder) folderNames[id] = folder.name;
    }
  }
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/watch-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, folderIds, folderNames }),
    }),
  );
}

export async function updateSenderFilters(
  app: ConnectedApplication,
  filters: SenderDomainFilters,
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: app.applicationId,
        displayName: app.displayName,
        providerId: app.providerId,
        connectionMethod: app.connectionMethod,
        enabledFeatures: app.enabledFeatures,
        ...((app.providerId === 'google-gmail') && { gmailPubsubTopicName: app.gmailPubsubTopicName }),
        senderDomainFilters: filters,
      }),
    }),
  );
}

export async function updateAutoExecuteActionTypes(
  app: ConnectedApplication,
  types: string[],
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: app.applicationId,
        displayName: app.displayName,
        providerId: app.providerId,
        connectionMethod: app.connectionMethod,
        enabledFeatures: app.enabledFeatures,
        ...((app.providerId === 'google-gmail') && { gmailPubsubTopicName: app.gmailPubsubTopicName }),
        autoExecuteActionTypes: types,
      }),
    }),
  );
}

export async function deleteContextDocuments(applicationId: string): Promise<{ deletionRun: import('../../components/types').ApplicationContextDeletionRun }> {
  return readJson<{ deletionRun: import('../../components/types').ApplicationContextDeletionRun }>(
    await apiFetch('/user/application/context/delete-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    }),
  );
}

export async function dismissError(
  applicationId: string,
  errorType: 'processing' | 'context',
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/dismiss-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, errorType }),
    }),
  );
}

export async function loadIntegrations(applicationId: string): Promise<{ integrations: OutboundIntegration[] }> {
  return readJson<{ integrations: OutboundIntegration[] }>(
    await apiFetch(`/user/application/integrations?applicationId=${encodeURIComponent(applicationId)}`),
  );
}

export async function createIntegration(
  applicationId: string,
  integrationType: OutboundIntegrationType,
  name: string,
  webhookUrl: string,
): Promise<{ integration: OutboundIntegration }> {
  return readJson<{ integration: OutboundIntegration }>(
    await apiFetch('/user/application/integration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, integrationType, name, webhookUrl }),
    }),
  );
}

export async function updateIntegration(
  integrationId: string,
  patch: { name?: string; enabled?: boolean; webhookUrl?: string },
): Promise<{ integration: OutboundIntegration }> {
  return readJson<{ integration: OutboundIntegration }>(
    await apiFetch('/user/application/integration', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, ...patch }),
    }),
  );
}

export async function deleteIntegration(integrationId: string): Promise<{ success: boolean }> {
  return readJson<{ success: boolean }>(
    await apiFetch('/user/application/integration', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId }),
    }),
  );
}

export async function testIntegration(integrationId: string): Promise<{ success: boolean }> {
  return readJson<{ success: boolean }>(
    await apiFetch('/user/application/integration/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId }),
    }),
  );
}

export async function fetchIntegrationDeliveries(integrationId: string, limit = 20): Promise<{ logs: IntegrationDeliveryLog[] }> {
  return readJson<{ logs: IntegrationDeliveryLog[] }>(
    await apiFetch(`/user/application/integration/deliveries?integrationId=${encodeURIComponent(integrationId)}&limit=${limit}`),
  );
}

export async function updateRules(
  applicationId: string,
  rules: EmailProcessingRule[],
): Promise<{ application: ConnectedApplication }> {
  return readJson<{ application: ConnectedApplication }>(
    await apiFetch('/user/application/rules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, rules }),
    }),
  );
}

export async function suggestRule(
  applicationId: string,
  description: string,
): Promise<{ rule: Omit<EmailProcessingRule, 'ruleId'> }> {
  return readJson<{ rule: Omit<EmailProcessingRule, 'ruleId'> }>(
    await apiFetch('/user/application/rules/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, description }),
    }),
  );
}

export async function loadLabels(applicationId: string): Promise<{ labels: Array<{ id: string; name: string }> }> {
  return readJson<{ labels: Array<{ id: string; name: string }> }>(
    await apiFetch(`/user/application/labels?applicationId=${encodeURIComponent(applicationId)}`),
  );
}

export async function saveDigestConfig(
  applicationId: string,
  config: Pick<DigestConfig, 'enabled' | 'sendTime' | 'sections'>,
): Promise<{ digestConfig: DigestConfig }> {
  return readJson<{ digestConfig: DigestConfig }>(
    await apiFetch('/user/application/digest', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, ...config }),
    }),
  );
}

export async function sendDigestNow(applicationId: string): Promise<{ sent: boolean }> {
  return readJson<{ sent: boolean }>(
    await apiFetch('/user/application/digest/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    }),
  );
}
