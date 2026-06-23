import type { ActiveView } from '../types';
import type { MailboxCallbacksContextValue } from '../contexts/MailboxCallbacksContext';
import type { useMailboxes } from './useMailboxes';
import type { useContextAudit } from './useContextAudit';

type MailboxesHook = ReturnType<typeof useMailboxes>;
type ContextAuditHook = ReturnType<typeof useContextAudit>;

export function useMailboxCallbacksValue(
  mailboxes: MailboxesHook,
  contextAudit: ContextAuditHook,
  isBusy: boolean,
  setActiveView: (view: ActiveView) => void,
): MailboxCallbacksContextValue {
  return {
    busy: isBusy,
    onEdit: mailboxes.editApplication,
    onDelete: () => {
      if (mailboxes.selectedApplication) {
        mailboxes.setConfirmDelete({
          applicationId: mailboxes.selectedApplication.applicationId,
          displayName: mailboxes.selectedApplication.displayName,
        });
      }
    },
    onStartOAuth2: mailboxes.startOAuth2,
    onStartWatch: mailboxes.startWatch,
    onStopWatch: mailboxes.stopWatch,
    onLoadFolders: mailboxes.loadFolders,
    onUpdateWatchedFolders: mailboxes.updateWatchedFolderIds,
    onUpdateSenderFilters: mailboxes.updateSenderFilters,
    onUpdateContextIndexing: mailboxes.updateContextIndexing,
    onUpdateMaxContextDocuments: mailboxes.updateMaxContextDocuments,
    onOpenContextAudit: (id: string) => {
      contextAudit.setAuditApplicationId(id);
      setActiveView('context');
    },
    onDeleteContextDocuments: mailboxes.deleteContextDocuments,
    onDismissProcessingError: (id: string) => mailboxes.dismissError(id, 'processing'),
    onDismissContextError: (id: string) => mailboxes.dismissError(id, 'context'),
    integrationsByApplicationId: mailboxes.integrationsByApplicationId,
    loadingIntegrations: mailboxes.loadingIntegrations,
    onLoadIntegrations: mailboxes.loadIntegrations,
    onCreateIntegration: mailboxes.createIntegration,
    onUpdateIntegration: mailboxes.updateIntegration,
    onDeleteIntegration: async (integrationId: string) => {
      const allIntegrations = Object.values(mailboxes.integrationsByApplicationId).flat();
      const found = allIntegrations.find((i) => i.integrationId === integrationId);
      if (found) await mailboxes.deleteIntegration(integrationId, found.applicationId);
    },
    onTestIntegration: mailboxes.testIntegration,
    onUpdateRules: mailboxes.updateRules,
  };
}
