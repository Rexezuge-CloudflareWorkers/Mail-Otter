import { createContext, useContext } from 'react';
import type { ConnectedApplication, DigestConfig, EmailProcessingRule, IntegrationDeliveryLog, OutboundIntegration, OutboundIntegrationType, SenderDomainFilters } from '../../components/types';

export interface MailboxCallbacksContextValue {
  busy: boolean;
  onEdit: (app: ConnectedApplication) => void;
  onDelete: () => void;
  onStartOAuth2: (id: string) => void;
  onStartWatch: (id: string) => void;
  onStopWatch: (id: string) => void;
  onLoadFolders: (id: string) => void;
  onUpdateWatchedFolders: (id: string, folderIds: string[] | null) => void;
  onUpdateSenderFilters: (id: string, filters: SenderDomainFilters) => void;
  onUpdateAutoExecuteActionTypes: (id: string, types: string[]) => void;
  onSaveDigestConfig: (id: string, config: Pick<DigestConfig, 'enabled' | 'sendTime' | 'sections'>) => Promise<void>;
  onSendDigestNow: (id: string) => Promise<void>;
  onUpdateContextIndexing: (id: string, enabled: boolean) => void;
  onUpdateRagRetrieval: (id: string, enabled: boolean) => void;
  onUpdateAttachmentVisionEnabled: (id: string, enabled: boolean) => void;
  onUpdateMaxContextDocuments: (id: string, max: number | null) => void;
  onOpenContextAudit: (id: string) => void;
  onDeleteContextDocuments: (id: string) => void;
  onDismissProcessingError: (id: string) => void;
  onDismissContextError: (id: string) => void;
  onUpdateRules: (applicationId: string, rules: EmailProcessingRule[]) => Promise<void>;
  onCreateIntegration: (applicationId: string, integrationType: OutboundIntegrationType, name: string, webhookUrl: string) => Promise<void>;
  onUpdateIntegration: (integrationId: string, patch: { name?: string; enabled?: boolean; webhookUrl?: string }) => Promise<void>;
  onDeleteIntegration: (integrationId: string) => Promise<void>;
  onTestIntegration: (integrationId: string) => Promise<void>;
  integrationsByApplicationId: Record<string, OutboundIntegration[]>;
  loadingIntegrations: boolean;
  onLoadIntegrations: (applicationId: string) => Promise<void>;
  deliveryLogsByIntegrationId: Record<string, IntegrationDeliveryLog[]>;
  loadingDeliveryLogs: boolean;
  openDeliveryLogsIntegrationId: string | null;
  onFetchDeliveryLogs: (integrationId: string) => Promise<void>;
  onCloseDeliveryLogs: () => void;
}

export const MailboxCallbacksContext = createContext<MailboxCallbacksContextValue | null>(null);

export function useMailboxCallbacks(): MailboxCallbacksContextValue {
  const ctx = useContext(MailboxCallbacksContext);
  if (!ctx) throw new Error('useMailboxCallbacks must be used inside MailboxCallbacksContext.Provider');
  return ctx;
}
