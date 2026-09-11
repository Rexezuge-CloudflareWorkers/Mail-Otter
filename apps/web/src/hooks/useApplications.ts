import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectedApplication, DigestConfig, EmailProcessingRule, SenderDomainFilters } from '../types';
import type { ApplicationFormState } from '../components/mailboxes/MailboxForm';
import { emptyForm } from '../components/mailboxes/MailboxForm';
import * as appSvc from '../services/applicationService';

interface UseMailboxesOptions {
  setIsBusy: (v: boolean) => void;
  showNotice: (type: 'success' | 'error', text: string) => void;
  onContextChanged?: () => void;
}

export function useApplications({ setIsBusy, showNotice, onContextChanged }: UseMailboxesOptions) {
  const { t } = useTranslation();
  const [applications, setApplications] = useState<ConnectedApplication[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [applicationForm, setApplicationForm] = useState<ApplicationFormState>(emptyForm);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [watchWebhookUrl, setWatchWebhookUrl] = useState('');
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }> | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ applicationId: string; displayName: string } | null>(null);

  const selectedApplication = useMemo(
    () => applications.find((a) => a.applicationId === selectedApplicationId),
    [applications, selectedApplicationId],
  );

  const selectApplication = (id: string) => {
    setSelectedApplicationId(id);
    setAvailableFolders(null);
    setLoadingFolders(false);
  };

  const loadApplications = async () => {
    const data = await appSvc.loadApplications();
    setApplications(data.applications);
    setSelectedApplicationId((c) => c || data.applications[0]?.applicationId || '');
  };

  const resetForm = () => {
    setApplicationForm(emptyForm);
    setIsFormExpanded(false);
  };

  const editApplication = (app: ConnectedApplication) => {
    setApplicationForm({
      applicationId: app.applicationId,
      displayName: app.displayName,
      providerId: app.providerId,
      connectionMethod: app.connectionMethod,
      clientId: '',
      clientSecret: '',
      gmailPubsubTopicName: app.gmailPubsubTopicName || '',
      imapHost: app.imapHost || '',
      imapPort: app.imapPort == null ? '993' : String(app.imapPort),
      imapUsername: app.imapUsername || '',
      imapPassword: '',
      smtpHost: app.smtpHost || '',
      smtpPort: app.smtpPort == null ? '587' : String(app.smtpPort),
      enabledFeatures: app.enabledFeatures || [],
      timeZone: app.timeZone || new Intl.DateTimeFormat().resolvedOptions().timeZone,
      contentLanguage: app.contentLanguage || 'en',
    });
    setIsFormExpanded(true);
  };

  const saveApplication = async () => {
    setIsBusy(true);
    try {
      const data = await appSvc.saveApplication(applicationForm);
      showNotice('success', applicationForm.applicationId ? t('toasts.mailboxUpdated', 'Mailbox Updated.') : t('toasts.mailboxCreated', 'Mailbox Created.'));
      resetForm();
      await loadApplications();
      setSelectedApplicationId(data.application.applicationId);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.saveFailed', 'Unable To Save Mailbox.'));
    } finally {
      setIsBusy(false);
    }
  };

  const deleteApplication = async (applicationId: string) => {
    setIsBusy(true);
    try {
      await appSvc.deleteApplication(applicationId);
      showNotice('success', t('toasts.mailboxDeleted', 'Mailbox Deleted.'));
      setSelectedApplicationId('');
      setWatchWebhookUrl('');
      await loadApplications();
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.deleteFailed', 'Unable To Delete Mailbox.'));
    } finally {
      setIsBusy(false);
    }
  };

  const startOAuth2 = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await appSvc.startOAuth2(applicationId);
      globalThis.location.assign(data.authorizationUrl);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.oauthStartFailed', 'Unable To Start OAuth2.'));
      setIsBusy(false);
    }
  };

  const startWatch = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await appSvc.startWatch(applicationId);
      setWatchWebhookUrl(data.webhookUrl);
      await loadApplications();
      showNotice('success', data.message);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.watchStartFailed', 'Unable To Start Watch.'));
    } finally {
      setIsBusy(false);
    }
  };

  const stopWatch = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await appSvc.stopWatch(applicationId);
      setWatchWebhookUrl('');
      await loadApplications();
      showNotice('success', data.message);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.watchStopFailed', 'Unable To Stop Watch.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateContextIndexing = async (applicationId: string, enabled: boolean) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateContextIndexing(applicationId, enabled);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', enabled ? t('toasts.contextIndexingEnabled', 'Context Indexing Enabled.') : t('toasts.contextIndexingDisabled', 'Context Indexing Disabled.'));
      onContextChanged?.();
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.contextUpdateFailed', 'Unable To Update Context Setting.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateRagRetrieval = async (applicationId: string, enabled: boolean) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateRagRetrieval(applicationId, enabled);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', enabled ? t('toasts.contextRetrievalEnabled', 'Context Retrieval Enabled.') : t('toasts.contextRetrievalDisabled', 'Context Retrieval Disabled.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.contextRetrievalFailed', 'Unable To Update Context Retrieval Setting.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateAttachmentVisionEnabled = async (applicationId: string, enabled: boolean) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateAttachmentVisionEnabled(applicationId, enabled);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', enabled ? t('toasts.attachmentVisionEnabled', 'Attachment Vision Enabled.') : t('toasts.attachmentVisionDisabled', 'Attachment Vision Disabled.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.attachmentVisionFailed', 'Unable To Update Attachment Vision Setting.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateMaxContextDocuments = async (applicationId: string, maxContextDocuments: number | null) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateMaxContextDocuments(applicationId, maxContextDocuments);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', maxContextDocuments == null ? t('toasts.documentLimitReset', 'Document Limit Reset.') : t('toasts.documentLimitSet', 'Document Limit Set To {{count}}.', { count: maxContextDocuments }));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.documentLimitFailed', 'Unable To Update Document Limit.'));
    } finally {
      setIsBusy(false);
    }
  };

  const loadFolders = async (applicationId: string) => {
    setLoadingFolders(true);
    try {
      const data = await appSvc.loadFolders(applicationId);
      setAvailableFolders(data.folders);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.foldersLoadFailed', 'Unable To Load Folders.'));
    } finally {
      setLoadingFolders(false);
    }
  };

  const updateWatchedFolderIds = async (applicationId: string, folderIds: string[] | null) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateWatchedFolderIds(applicationId, folderIds, availableFolders);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.watchFoldersFailed', 'Unable To Update Watch Folders.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateSenderFilters = async (applicationId: string, filters: SenderDomainFilters) => {
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!app) return;
    setIsBusy(true);
    try {
      const data = await appSvc.updateSenderFilters(app, filters);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', t('toasts.filtersSaved', 'Sender Filter Rules Updated.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.senderFiltersFailed', 'Unable To Update Sender Filters.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateAutoExecuteActionTypes = async (applicationId: string, types: string[]) => {
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!app) return;
    setIsBusy(true);
    try {
      const data = await appSvc.updateAutoExecuteActionTypes(app, types);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', t('toasts.autoExecuteUpdated', 'Auto-Execution Settings Updated.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.autoExecuteFailed', 'Unable To Update Auto-Execution Settings.'));
    } finally {
      setIsBusy(false);
    }
  };

  const saveDigestConfig = async (applicationId: string, config: Pick<DigestConfig, 'enabled' | 'sendTime' | 'sections'>) => {
    setIsBusy(true);
    try {
      const data = await appSvc.saveDigestConfig(applicationId, config);
      setApplications((c) => c.map((a) => (a.applicationId === applicationId ? { ...a, digestConfig: data.digestConfig } : a)));
      showNotice('success', t('toasts.digestSaved', 'Digest Settings Saved.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.digestSaveFailed', 'Unable To Save Digest Settings.'));
    } finally {
      setIsBusy(false);
    }
  };

  const sendDigestNow = async (applicationId: string) => {
    setIsBusy(true);
    try {
      await appSvc.sendDigestNow(applicationId);
      showNotice('success', t('toasts.digestSent', 'Digest Sent.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.digestSendFailed', 'Unable To Send Digest.'));
    } finally {
      setIsBusy(false);
    }
  };

  const deleteContextDocuments = async (applicationId: string) => {
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!globalThis.confirm(`Delete All Indexed Documents For ${app?.displayName || 'This Mailbox'}?`)) return;
    setIsBusy(true);
    try {
      const data = await appSvc.deleteContextDocuments(applicationId);
      await loadApplications();
      onContextChanged?.();
      showNotice(
        data.deletionRun.status === 'accepted' ? 'success' : 'error',
        data.deletionRun.status === 'accepted' ? t('toasts.contextDeletionAccepted', 'Context Documents Deletion Accepted.') : data.deletionRun.errorMessage || t('toasts.contextDeletionFailed', 'Context Deletion Failed.'),
      );
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.contextDeleteFailed', 'Unable To Delete Context Documents.'));
    } finally {
      setIsBusy(false);
    }
  };

  const dismissError = async (applicationId: string, errorType: 'processing' | 'context') => {
    setIsBusy(true);
    try {
      const data = await appSvc.dismissError(applicationId, errorType);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.dismissErrorFailed', 'Unable To Dismiss Error.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateRules = async (applicationId: string, rules: EmailProcessingRule[]) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateRules(applicationId, rules);
      setApplications((apps) => apps.map((a) => (a.applicationId === applicationId ? { ...a, emailProcessingRules: data.application.emailProcessingRules } : a)));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.rulesSaveFailed', 'Unable To Update Rules.'));
    } finally {
      setIsBusy(false);
    }
  };

  return {
    applications,
    selectedApplicationId,
    selectedApplication,
    setSelectedApplicationId: selectApplication,
    applicationForm,
    setApplicationForm,
    isFormExpanded,
    setIsFormExpanded,
    watchWebhookUrl,
    availableFolders,
    loadingFolders,
    confirmDelete,
    setConfirmDelete,
    loadApplications,
    resetForm,
    editApplication,
    saveApplication,
    deleteApplication,
    startOAuth2,
    startWatch,
    stopWatch,
    updateContextIndexing,
    updateRagRetrieval,
    updateAttachmentVisionEnabled,
    updateMaxContextDocuments,
    loadFolders,
    updateWatchedFolderIds,
    updateSenderFilters,
    updateAutoExecuteActionTypes,
    saveDigestConfig,
    sendDigestNow,
    deleteContextDocuments,
    dismissError,
    updateRules,
  };
}

export type { UseMailboxesOptions };
