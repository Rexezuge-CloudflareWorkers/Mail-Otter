import { useMemo, useState } from 'react';
import type { ConnectedApplication, SenderDomainFilters } from '../../components/types';
import type { ApplicationFormState } from '../components/mailboxes/MailboxForm';
import { emptyForm } from '../components/mailboxes/MailboxForm';
import * as appSvc from '../services/applicationService';

interface UseMailboxesOptions {
  setIsBusy: (v: boolean) => void;
  showNotice: (type: 'success' | 'error', text: string) => void;
  onContextChanged?: () => void;
}

export function useMailboxes({ setIsBusy, showNotice, onContextChanged }: UseMailboxesOptions) {
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
      clientId: '',
      clientSecret: '',
      gmailPubsubTopicName: app.gmailPubsubTopicName || '',
      enabledFeatures: app.enabledFeatures || [],
    });
    setIsFormExpanded(true);
  };

  const saveApplication = async () => {
    setIsBusy(true);
    try {
      const data = await appSvc.saveApplication(applicationForm);
      showNotice('success', applicationForm.applicationId ? 'Mailbox Updated.' : 'Mailbox Created.');
      resetForm();
      await loadApplications();
      setSelectedApplicationId(data.application.applicationId);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Save Mailbox.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteApplication = async (applicationId: string) => {
    setIsBusy(true);
    try {
      await appSvc.deleteApplication(applicationId);
      showNotice('success', 'Mailbox Deleted.');
      setSelectedApplicationId('');
      setWatchWebhookUrl('');
      await loadApplications();
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Delete Mailbox.');
    } finally {
      setIsBusy(false);
    }
  };

  const startOAuth2 = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await appSvc.startOAuth2(applicationId);
      window.location.assign(data.authorizationUrl);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Start OAuth2.');
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
      showNotice('error', e instanceof Error ? e.message : 'Unable To Start Watch.');
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
      showNotice('error', e instanceof Error ? e.message : 'Unable To Stop Watch.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateContextIndexing = async (applicationId: string, enabled: boolean) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateContextIndexing(applicationId, enabled);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', enabled ? 'Context Indexing Enabled.' : 'Context Indexing Disabled.');
      onContextChanged?.();
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Context Setting.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateMaxContextDocuments = async (applicationId: string, maxContextDocuments: number | null) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateMaxContextDocuments(applicationId, maxContextDocuments);
      setApplications((c) => c.map((a) => (a.applicationId === data.application.applicationId ? data.application : a)));
      showNotice('success', maxContextDocuments != null ? `Document Limit Set To ${maxContextDocuments}.` : 'Document Limit Reset.');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Document Limit.');
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
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Folders.');
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
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Watch Folders.');
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
      showNotice('success', 'Sender Filter Rules Updated.');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Update Sender Filters.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteContextDocuments = async (applicationId: string) => {
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!window.confirm(`Delete All Indexed Documents For ${app?.displayName || 'This Mailbox'}?`)) return;
    setIsBusy(true);
    try {
      const data = await appSvc.deleteContextDocuments(applicationId);
      await loadApplications();
      onContextChanged?.();
      showNotice(
        data.deletionRun.status === 'accepted' ? 'success' : 'error',
        data.deletionRun.status === 'accepted' ? 'Context Documents Deletion Accepted.' : data.deletionRun.errorMessage || 'Context Deletion Failed.',
      );
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Delete Context Documents.');
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
      showNotice('error', e instanceof Error ? e.message : 'Unable To Dismiss Error.');
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
    updateMaxContextDocuments,
    loadFolders,
    updateWatchedFolderIds,
    updateSenderFilters,
    deleteContextDocuments,
    dismissError,
  };
}
