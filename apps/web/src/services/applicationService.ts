import type { ConnectedApplication, DigestConfig, EmailProcessingRule, IntegrationDeliveryLog, OutboundIntegration, OutboundIntegrationType, SenderDomainFilters, ApplicationContextDeletionRun } from '../types';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import type { ApplicationFormState } from '../components/mailboxes/MailboxForm';

type ApplicationResult = { application: ConnectedApplication };

async function updateContextField(applicationId: string, field: Record<string, unknown>): Promise<ApplicationResult> {
  return apiPut<ApplicationResult>('/user/application/context', { applicationId, ...field });
}

function baseApplicationPayload(app: ConnectedApplication): Record<string, unknown> {
  return {
    applicationId: app.applicationId,
    displayName: app.displayName,
    providerId: app.providerId,
    connectionMethod: app.connectionMethod,
    enabledFeatures: app.enabledFeatures,
    ...(app.providerId === 'google-gmail' && { gmailPubsubTopicName: app.gmailPubsubTopicName }),
  };
}

export async function loadApplications(): Promise<{ applications: ConnectedApplication[] }> {
  return apiGet<{ applications: ConnectedApplication[] }>('/user/applications');
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
    ...(form.providerId === 'google-gmail' && { gmailPubsubTopicName: form.gmailPubsubTopicName }),
    ...(form.imapHost && { imapHost: form.imapHost }),
    ...(form.imapPort && { imapPort: Number(form.imapPort) }),
    ...(form.imapUsername && { imapUsername: form.imapUsername }),
    ...(form.imapPassword && isImapPassword && { imapPassword: form.imapPassword }),
    ...(form.smtpHost && { smtpHost: form.smtpHost }),
    ...(form.smtpPort && { smtpPort: Number(form.smtpPort) }),
  };
  return form.applicationId
    ? apiPut<{ application: ConnectedApplication }>('/user/application', payload)
    : apiPost<{ application: ConnectedApplication }>('/user/application', payload);
}

export async function deleteApplication(applicationId: string): Promise<void> {
  await apiDelete<{ success: boolean }>('/user/application', { applicationId });
}

export async function startOAuth2(applicationId: string): Promise<{ authorizationUrl: string }> {
  return apiPost<{ authorizationUrl: string }>('/user/application/oauth2/authorize', { applicationId });
}

export async function startWatch(applicationId: string): Promise<{ message: string; webhookUrl: string }> {
  return apiPost<{ message: string; webhookUrl: string }>('/user/application/watch', { applicationId });
}

export async function stopWatch(applicationId: string): Promise<{ message: string }> {
  return apiPost<{ message: string }>('/user/application/stop', { applicationId });
}

export async function updateContextIndexing(
  applicationId: string,
  contextIndexingEnabled: boolean,
): Promise<{ application: ConnectedApplication }> {
  return updateContextField(applicationId, { contextIndexingEnabled });
}

export async function updateRagRetrieval(
  applicationId: string,
  ragRetrievalEnabled: boolean,
): Promise<{ application: ConnectedApplication }> {
  return updateContextField(applicationId, { ragRetrievalEnabled });
}

export async function updateAttachmentVisionEnabled(
  applicationId: string,
  attachmentVisionEnabled: boolean,
): Promise<{ application: ConnectedApplication }> {
  return updateContextField(applicationId, { attachmentVisionEnabled });
}

export async function updateMaxContextDocuments(
  applicationId: string,
  maxContextDocuments: number | null,
): Promise<{ application: ConnectedApplication }> {
  return updateContextField(applicationId, { maxContextDocuments });
}

export async function loadFolders(applicationId: string): Promise<{ folders: Array<{ id: string; name: string }> }> {
  return apiGet<{ folders: Array<{ id: string; name: string }> }>('/user/application/folders', {
    applicationId,
  });
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
  return apiPut<{ application: ConnectedApplication }>('/user/application/watch-settings', {
    applicationId,
    folderIds,
    folderNames,
  });
}

export async function updateSenderFilters(
  app: ConnectedApplication,
  filters: SenderDomainFilters,
): Promise<{ application: ConnectedApplication }> {
  return apiPut<{ application: ConnectedApplication }>('/user/application', {
    ...baseApplicationPayload(app),
    senderDomainFilters: filters,
  });
}

export async function updateAutoExecuteActionTypes(
  app: ConnectedApplication,
  types: string[],
): Promise<{ application: ConnectedApplication }> {
  return apiPut<{ application: ConnectedApplication }>('/user/application', {
    ...baseApplicationPayload(app),
    autoExecuteActionTypes: types,
  });
}

export async function deleteContextDocuments(applicationId: string): Promise<{ deletionRun: ApplicationContextDeletionRun }> {
  return apiPost<{ deletionRun: ApplicationContextDeletionRun }>('/user/application/context/delete-documents', {
    applicationId,
  });
}

export async function dismissError(
  applicationId: string,
  errorType: 'processing' | 'context',
): Promise<{ application: ConnectedApplication }> {
  return apiPost<{ application: ConnectedApplication }>('/user/application/dismiss-error', {
    applicationId,
    errorType,
  });
}

export async function loadIntegrations(applicationId: string): Promise<{ integrations: OutboundIntegration[] }> {
  return apiGet<{ integrations: OutboundIntegration[] }>('/user/application/integrations', {
    applicationId,
  });
}

export async function createIntegration(
  applicationId: string,
  integrationType: OutboundIntegrationType,
  name: string,
  webhookUrl: string,
): Promise<{ integration: OutboundIntegration }> {
  return apiPost<{ integration: OutboundIntegration }>('/user/application/integration', {
    applicationId,
    integrationType,
    name,
    webhookUrl,
  });
}

export async function updateIntegration(
  integrationId: string,
  patch: { name?: string; enabled?: boolean; webhookUrl?: string },
): Promise<{ integration: OutboundIntegration }> {
  return apiPut<{ integration: OutboundIntegration }>('/user/application/integration', {
    integrationId,
    ...patch,
  });
}

export async function deleteIntegration(integrationId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>('/user/application/integration', { integrationId });
}

export async function testIntegration(integrationId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>('/user/application/integration/test', { integrationId });
}

export async function fetchIntegrationDeliveries(integrationId: string, limit = 20): Promise<{ logs: IntegrationDeliveryLog[] }> {
  return apiGet<{ logs: IntegrationDeliveryLog[] }>('/user/application/integration/deliveries', {
    integrationId,
    limit: String(limit),
  });
}

export async function updateRules(
  applicationId: string,
  rules: EmailProcessingRule[],
): Promise<{ application: ConnectedApplication }> {
  return apiPut<{ application: ConnectedApplication }>('/user/application/rules', { applicationId, rules });
}

export async function suggestRule(
  applicationId: string,
  description: string,
): Promise<{ rule: Omit<EmailProcessingRule, 'ruleId'> }> {
  return apiPost<{ rule: Omit<EmailProcessingRule, 'ruleId'> }>('/user/application/rules/suggest', {
    applicationId,
    description,
  });
}

export async function loadLabels(applicationId: string): Promise<{ labels: Array<{ id: string; name: string }> }> {
  return apiGet<{ labels: Array<{ id: string; name: string }> }>('/user/application/labels', {
    applicationId,
  });
}

export async function saveDigestConfig(
  applicationId: string,
  config: Pick<DigestConfig, 'enabled' | 'sendTime' | 'sections'>,
): Promise<{ digestConfig: DigestConfig }> {
  return apiPut<{ digestConfig: DigestConfig }>('/user/application/digest', { applicationId, ...config });
}

export async function sendDigestNow(applicationId: string): Promise<{ sent: boolean }> {
  return apiPost<{ sent: boolean }>('/user/application/digest/send', { applicationId });
}
