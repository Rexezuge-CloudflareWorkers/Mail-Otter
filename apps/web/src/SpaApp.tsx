import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Unauthorized from '../components/Unauthorized';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDocument,
  ApplicationContextDocumentStatus,
  ConnectedApplication,
  CurrentUser,
  EmailAction,
  EmailActionExecution,
  EmailActionStatus,
  ProviderId,
} from '../components/types';
import { apiFetch, formatExpiryTimestamp, formatTimestamp, methodLabels, providerLabels, providerMethod, readJson } from '../components/utils';

interface ApplicationFormState {
  applicationId?: string;
  displayName: string;
  providerId: ProviderId;
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName: string;
}

const emptyForm: ApplicationFormState = {
  displayName: '',
  providerId: 'google-gmail',
  clientId: '',
  clientSecret: '',
  gmailPubsubTopicName: '',
};

type ActiveView = 'mailboxes' | 'context' | 'actions';

function getInitialNotice(): { type: 'success' | 'error'; text: string } | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('oauth2') === 'connected') return { type: 'success', text: 'OAuth2 connection completed.' };
  if (params.get('oauth2') === 'error') return { type: 'error', text: params.get('message') || 'OAuth2 connection failed.' };
  return null;
}

export default function SpaApp() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [applications, setApplications] = useState<ConnectedApplication[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>('');
  const [applicationForm, setApplicationForm] = useState<ApplicationFormState>(emptyForm);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(() => getInitialNotice());
  const [isBusy, setIsBusy] = useState(false);
  const [watchWebhookUrl, setWatchWebhookUrl] = useState<string>('');
  const [activeView, setActiveView] = useState<ActiveView>('mailboxes');
  const [auditApplicationId, setAuditApplicationId] = useState<string>('');
  const [auditStatus, setAuditStatus] = useState<ApplicationContextDocumentStatus | ''>('');
  const [contextDocuments, setContextDocuments] = useState<ApplicationContextDocument[]>([]);
  const [contextDocumentsCursor, setContextDocumentsCursor] = useState<string | undefined>();
  const [contextDeletionRuns, setContextDeletionRuns] = useState<ApplicationContextDeletionRun[]>([]);
  const [contextDeletionRunsCursor, setContextDeletionRunsCursor] = useState<string | undefined>();
  const [actions, setActions] = useState<EmailAction[]>([]);
  const [actionsCursor, setActionsCursor] = useState<string | undefined>();
  const [actionApplicationId, setActionApplicationId] = useState<string>('');
  const [actionStatus, setActionStatus] = useState<EmailActionStatus | ''>('');
  const [actionExecutions, setActionExecutions] = useState<EmailActionExecution[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<{ applicationId: string; displayName: string } | null>(null);
  const [availableFolders, setAvailableFolders] = useState<Array<{ id: string; name: string }> | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);

  useEffect(() => {
    if (!confirmDelete) return;
    const close = () => setConfirmDelete(null);
    document.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [confirmDelete]);

  useEffect(() => {
    setAvailableFolders(null);
    setLoadingFolders(false);
  }, [selectedApplicationId]);

  const selectedApplication = useMemo(
    () => applications.find((application) => application.applicationId === selectedApplicationId),
    [applications, selectedApplicationId],
  );

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const loadApplications = useCallback(async () => {
    const data = await readJson<{ applications: ConnectedApplication[] }>(await apiFetch('/user/applications'));
    setApplications(data.applications);
    setSelectedApplicationId((current) => current || data.applications[0]?.applicationId || '');
  }, []);

  const loadContextAudit = useCallback(
    async (append = false, documentCursor?: string | undefined, deletionCursor?: string | undefined) => {
      const documentParams = new URLSearchParams();
      const deletionParams = new URLSearchParams();
      if (auditApplicationId) {
        documentParams.set('applicationId', auditApplicationId);
        deletionParams.set('applicationId', auditApplicationId);
      }
      if (auditStatus) documentParams.set('status', auditStatus);
      if (documentCursor) documentParams.set('cursor', documentCursor);
      if (deletionCursor) deletionParams.set('cursor', deletionCursor);

      const [documentData, deletionData] = await Promise.all([
        readJson<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(
          await apiFetch(`/user/application/context/documents?${documentParams.toString()}`),
        ),
        readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
          await apiFetch(`/user/application/context/deletions?${deletionParams.toString()}`),
        ),
      ]);
      setContextDocuments((current) => (append ? [...current, ...documentData.documents] : documentData.documents));
      setContextDocumentsCursor(documentData.nextCursor);
      setContextDeletionRuns((current) => (append ? [...current, ...deletionData.deletionRuns] : deletionData.deletionRuns));
      setContextDeletionRunsCursor(deletionData.nextCursor);
    },
    [auditApplicationId, auditStatus],
  );

  const loadActions = useCallback(
    async (append = false, cursor?: string | undefined) => {
      const params = new URLSearchParams();
      if (actionApplicationId) params.set('applicationId', actionApplicationId);
      if (actionStatus) params.set('status', actionStatus);
      if (cursor) params.set('cursor', cursor);
      const data = await readJson<{ actions: EmailAction[]; nextCursor?: string }>(await apiFetch(`/user/actions?${params.toString()}`));
      setActions((current) => (append ? [...current, ...data.actions] : data.actions));
      setActionsCursor(data.nextCursor);
      setSelectedActionId((current) => current || data.actions[0]?.actionId || '');
    },
    [actionApplicationId, actionStatus],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const me = await readJson<CurrentUser>(await apiFetch('/user/me'));
        setUser(me);
        setAuthorized(true);
        await loadApplications();
      } catch {
        setAuthorized(false);
      }
    };
    load();
  }, [loadApplications]);

  useEffect(() => {
    if (authorized && activeView === 'context') {
      loadContextAudit().catch((error: unknown): void => {
        showNotice('error', error instanceof Error ? error.message : 'Unable to load context audit.');
      });
    }
  }, [activeView, authorized, loadContextAudit, showNotice]);

  useEffect(() => {
    if (authorized && activeView === 'actions') {
      loadActions().catch((error: unknown): void => {
        showNotice('error', error instanceof Error ? error.message : 'Unable to load actions.');
      });
    }
  }, [activeView, authorized, loadActions, showNotice]);

  const resetForm = () => {
    setApplicationForm(emptyForm);
  };

  const editApplication = (application: ConnectedApplication) => {
    setApplicationForm({
      applicationId: application.applicationId,
      displayName: application.displayName,
      providerId: application.providerId,
      clientId: '',
      clientSecret: '',
      gmailPubsubTopicName: application.gmailPubsubTopicName || '',
    });
  };

  const saveApplication = async () => {
    setIsBusy(true);
    try {
      const payload = {
        applicationId: applicationForm.applicationId,
        displayName: applicationForm.displayName,
        providerId: applicationForm.providerId,
        connectionMethod: providerMethod[applicationForm.providerId],
        clientId: applicationForm.clientId,
        clientSecret: applicationForm.clientSecret,
        ...(applicationForm.providerId === 'google-gmail' ? { gmailPubsubTopicName: applicationForm.gmailPubsubTopicName } : {}),
      };
      const response = await apiFetch('/user/application', {
        method: applicationForm.applicationId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ application: ConnectedApplication }>(response);
      showNotice('success', applicationForm.applicationId ? 'Application updated.' : 'Application created.');
      resetForm();
      await loadApplications();
      setSelectedApplicationId(data.application.applicationId);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to save application.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteApplication = async (applicationId: string) => {
    setIsBusy(true);
    try {
      await readJson<{ success: boolean }>(
        await apiFetch('/user/application', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      showNotice('success', 'Application deleted.');
      setSelectedApplicationId('');
      setWatchWebhookUrl('');
      await loadApplications();
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to delete application.');
    } finally {
      setIsBusy(false);
    }
  };

  const startOAuth2 = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ authorizationUrl: string }>(
        await apiFetch('/user/application/oauth2/authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to start OAuth2.');
      setIsBusy(false);
    }
  };

  const startWatch = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ message: string; webhookUrl: string }>(
        await apiFetch('/user/application/watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      setWatchWebhookUrl(data.webhookUrl);
      await loadApplications();
      showNotice('success', data.message);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to start watch.');
    } finally {
      setIsBusy(false);
    }
  };

  const stopWatch = async (applicationId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ message: string }>(
        await apiFetch('/user/application/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      setWatchWebhookUrl('');
      await loadApplications();
      showNotice('success', data.message);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to stop watch.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateContextIndexing = async (applicationId: string, contextIndexingEnabled: boolean) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, contextIndexingEnabled }),
        }),
      );
      setApplications((current) =>
        current.map((application) => (application.applicationId === data.application.applicationId ? data.application : application)),
      );
      showNotice('success', contextIndexingEnabled ? 'Context indexing enabled.' : 'Context indexing disabled.');
      if (activeView === 'context') await loadContextAudit();
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to update context setting.');
    } finally {
      setIsBusy(false);
    }
  };

  const updateMaxContextDocuments = async (applicationId: string, maxContextDocuments: number | null) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/context', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, maxContextDocuments }),
        }),
      );
      setApplications((current) =>
        current.map((application) => (application.applicationId === data.application.applicationId ? data.application : application)),
      );
      showNotice('success', maxContextDocuments != null ? `Document limit set to ${maxContextDocuments}.` : 'Document limit reset to default.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to update document limit.');
    } finally {
      setIsBusy(false);
    }
  };

  const loadFolders = async (applicationId: string) => {
    setLoadingFolders(true);
    try {
      const data = await readJson<{ folders: Array<{ id: string; name: string }> }>(
        await apiFetch(`/user/application/folders?applicationId=${encodeURIComponent(applicationId)}`),
      );
      setAvailableFolders(data.folders);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to load folders.');
    } finally {
      setLoadingFolders(false);
    }
  };

  const updateWatchedFolderIds = async (applicationId: string, folderIds: string[] | null) => {
    setIsBusy(true);
    try {
      const folderNames: Record<string, string> = {};
      if (folderIds && availableFolders) {
        for (const folderId of folderIds) {
          const folder = availableFolders.find((f) => f.id === folderId);
          if (folder) folderNames[folderId] = folder.name;
        }
      }
      const data = await readJson<{ application: ConnectedApplication }>(
        await apiFetch('/user/application/watch-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, folderIds, folderNames }),
        }),
      );
      setApplications((current) =>
        current.map((application) => (application.applicationId === data.application.applicationId ? data.application : application)),
      );
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to update watch folders.');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteContextDocuments = async (applicationId: string) => {
    const application = applications.find((item) => item.applicationId === applicationId);
    if (!window.confirm(`Delete all indexed documents for ${application?.displayName || 'this application'}?`)) return;
    setIsBusy(true);
    try {
      const data = await readJson<{ deletionRun: ApplicationContextDeletionRun }>(
        await apiFetch('/user/application/context/delete-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      await loadApplications();
      if (activeView === 'context') await loadContextAudit();
      showNotice(
        data.deletionRun.status === 'accepted' ? 'success' : 'error',
        data.deletionRun.status === 'accepted'
          ? 'Context documents deletion accepted.'
          : data.deletionRun.errorMessage || 'Context deletion failed.',
      );
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to delete context documents.');
    } finally {
      setIsBusy(false);
    }
  };

  const loadMoreContextDocuments = async () => {
    if (!contextDocumentsCursor) return;
    const params = new URLSearchParams();
    if (auditApplicationId) params.set('applicationId', auditApplicationId);
    if (auditStatus) params.set('status', auditStatus);
    params.set('cursor', contextDocumentsCursor);
    const data = await readJson<{ documents: ApplicationContextDocument[]; nextCursor?: string }>(
      await apiFetch(`/user/application/context/documents?${params.toString()}`),
    );
    setContextDocuments((current) => [...current, ...data.documents]);
    setContextDocumentsCursor(data.nextCursor);
  };

  const loadMoreContextDeletions = async () => {
    if (!contextDeletionRunsCursor) return;
    const params = new URLSearchParams();
    if (auditApplicationId) params.set('applicationId', auditApplicationId);
    params.set('cursor', contextDeletionRunsCursor);
    const data = await readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
      await apiFetch(`/user/application/context/deletions?${params.toString()}`),
    );
    setContextDeletionRuns((current) => [...current, ...data.deletionRuns]);
    setContextDeletionRunsCursor(data.nextCursor);
  };

  const loadMoreActions = async () => {
    if (!actionsCursor) return;
    await loadActions(true, actionsCursor);
  };

  const loadActionExecutions = async (actionId: string) => {
    setSelectedActionId(actionId);
    try {
      const data = await readJson<{ executions: EmailActionExecution[] }>(
        await apiFetch(`/user/actions/${encodeURIComponent(actionId)}/executions`),
      );
      setActionExecutions(data.executions);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to load action audit.');
    }
  };

  const executeAction = async (actionId: string) => {
    setIsBusy(true);
    try {
      const data = await readJson<{ action: EmailAction }>(
        await apiFetch(`/user/actions/${encodeURIComponent(actionId)}/execute`, { method: 'POST' }),
      );
      setActions((current) => current.map((action) => (action.actionId === data.action.actionId ? data.action : action)));
      await loadActionExecutions(actionId);
      showNotice(data.action.status === 'succeeded' ? 'success' : 'error', data.action.result?.summary || data.action.errorMessage || data.action.status);
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to execute action.');
    } finally {
      setIsBusy(false);
    }
  };

  const openContextDocumentInProvider = async (contextDocumentId: string) => {
    try {
      const data = await readJson<{ url: string }>(
        await apiFetch(`/user/application/context/document/${encodeURIComponent(contextDocumentId)}/provider-link`),
      );
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to open provider document.');
    }
  };

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-[#101319] text-white flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-[#6ee7b7] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authorized || !user) {
    return <Unauthorized />;
  }

  return (
    <div className="min-h-screen bg-[#101319] text-[#f3f4f6]">
      <header className="sticky top-0 z-40 border-b border-[#252b36] bg-[#101319]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="text-xl font-semibold">
              <span className="text-[#6ee7b7]">Mail</span>-Otter
            </div>
            <div className="flex items-center rounded-md bg-[#1a1f29] p-1 text-sm text-[#aab4c2]">
              <button
                className={`px-3 py-1 rounded ${activeView === 'mailboxes' ? 'bg-[#2d3745] text-white' : 'hover:text-white'}`}
                onClick={() => setActiveView('mailboxes')}
              >
                Mailboxes
              </button>
              <button
                className={`px-3 py-1 rounded ${activeView === 'context' ? 'bg-[#2d3745] text-white' : 'hover:text-white'}`}
                onClick={() => setActiveView('context')}
              >
                Context Audit
              </button>
              <button
                className={`px-3 py-1 rounded ${activeView === 'actions' ? 'bg-[#2d3745] text-white' : 'hover:text-white'}`}
                onClick={() => setActiveView('actions')}
              >
                Actions
              </button>
            </div>
          </div>
          <div className="text-sm text-[#aab4c2] truncate">{user.email}</div>
        </div>
      </header>

      {notice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down px-5 py-3 rounded-md shadow-xl bg-[#1a1f29] border border-[#374151] max-w-[calc(100vw-2rem)]">
          <span className={notice.type === 'success' ? 'text-[#6ee7b7]' : 'text-[#fca5a5]'}>{notice.text}</span>
        </div>
      )}

      {activeView === 'mailboxes' ? (
        <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold">Connected Mailboxes</h1>
              <span className="text-sm text-[#aab4c2]">
                {applications.length}/{user.limits.maxApplicationsPerUser}
              </span>
            </div>

            <div className="space-y-3">
              {applications.map((application) => (
                <button
                  key={application.applicationId}
                  onClick={() => setSelectedApplicationId(application.applicationId)}
                  className={`w-full text-left p-4 rounded-md border transition ${
                    selectedApplicationId === application.applicationId
                      ? 'border-[#6ee7b7] bg-[#17221f]'
                      : 'border-[#2d3745] bg-[#171c25] hover:border-[#526073]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">{application.displayName}</div>
                      <div className="text-sm text-[#aab4c2]">
                        {providerLabels[application.providerId]} / {methodLabels[application.connectionMethod]}
                      </div>
                      <div className="text-xs text-[#7d8896] truncate">{application.providerEmail || 'OAuth not connected'}</div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-[#7d8896]">
                        <ContextBadge enabled={application.contextIndexingEnabled} />
                        <span>{application.contextDocumentCount || 0} docs</span>
                      </div>
                    </div>
                    <StatusBadge status={application.status} />
                  </div>
                </button>
              ))}
              {applications.length === 0 && (
                <div className="p-5 rounded-md border border-[#2d3745] bg-[#171c25] text-[#aab4c2]">No mailboxes connected.</div>
              )}
            </div>

            <ApplicationForm
              form={applicationForm}
              setForm={setApplicationForm}
              onSave={saveApplication}
              onCancel={resetForm}
              busy={isBusy}
            />
          </section>

          <section className="space-y-6">
            {selectedApplication ? (
              <>
                <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-semibold truncate">{selectedApplication.displayName}</h2>
                        <StatusBadge status={selectedApplication.status} />
                        {selectedApplication.watchStatus && <WatchBadge status={selectedApplication.watchStatus} />}
                      </div>
                      <div className="text-sm text-[#aab4c2]">
                        {providerLabels[selectedApplication.providerId]} / {selectedApplication.providerEmail || 'not authorized'}
                      </div>
                      <div className="text-xs text-[#7d8896] mt-2">Updated {formatTimestamp(selectedApplication.updatedAt)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]"
                        onClick={() => editApplication(selectedApplication)}
                      >
                        Edit
                      </button>
                      <button
                        className="px-3 py-2 rounded-md bg-[#3a1f23] text-[#fecaca] hover:bg-[#4d272d]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({
                            applicationId: selectedApplication.applicationId,
                            displayName: selectedApplication.displayName,
                          });
                        }}
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4">
                    <ReadOnlyField label="OAuth2 redirect URI" value={selectedApplication.oauth2RedirectUri || ''} showCopy />
                    {selectedApplication.providerId === 'google-gmail' && (
                      <ReadOnlyField label="Gmail Pub/Sub topic" value={selectedApplication.gmailPubsubTopicName || ''} />
                    )}
                    <ReadOnlyField label="Webhook endpoint" value={watchWebhookUrl || selectedApplication.webhookUrl || ''} showCopy />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className="px-4 py-2 rounded-md bg-[#0f766e] hover:bg-[#0d9488] disabled:opacity-50"
                      onClick={() => startOAuth2(selectedApplication.applicationId)}
                      disabled={isBusy}
                    >
                      Start OAuth2
                    </button>
                    <button
                      className="px-4 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50"
                      onClick={() => startWatch(selectedApplication.applicationId)}
                      disabled={isBusy || selectedApplication.status !== 'connected' || selectedApplication.watchStatus === 'active'}
                    >
                      Start Watch
                    </button>
                    <button
                      className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655] disabled:opacity-50"
                      onClick={() => stopWatch(selectedApplication.applicationId)}
                      disabled={isBusy || selectedApplication.watchStatus !== 'active'}
                    >
                      Stop Watch
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
                  <h2 className="text-xl font-semibold mb-4">Processing</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <Metric label="Watch expires" value={formatExpiryTimestamp(selectedApplication.watchExpiresAt)} />
                    <Metric label="Last summary" value={formatTimestamp(selectedApplication.lastSummaryAt)} />
                    <Metric
                      label="Last error"
                      value={selectedApplication.lastError || 'None'}
                      tone={selectedApplication.lastError ? 'error' : 'muted'}
                      subtitle={selectedApplication.lastError ? formatTimestamp(selectedApplication.lastErrorAt) : undefined}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div>
                      <h2 className="text-xl font-semibold">Context</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-3 text-sm text-[#d1d5db]">
                        <input
                          type="checkbox"
                          checked={selectedApplication.contextIndexingEnabled}
                          onChange={(event) => updateContextIndexing(selectedApplication.applicationId, event.target.checked)}
                          disabled={isBusy}
                          className="h-4 w-4 accent-[#0d9488]"
                        />
                        Store documents
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-[#d1d5db]">
                        Max documents
                        <input
                          type="number"
                          min={1}
                          max={user?.limits.maxContextDocumentsPerApplication}
                          placeholder={`Default (${user?.limits.maxContextDocumentsPerApplication ?? ''})`}
                          value={selectedApplication.maxContextDocuments ?? ''}
                          onChange={(event) => {
                            const val = event.target.value === '' ? null : Number(event.target.value);
                            updateMaxContextDocuments(selectedApplication.applicationId, val);
                          }}
                          disabled={isBusy}
                          className="w-32 px-2 py-1 rounded bg-[#0e131b] border border-[#2d3745] text-white text-sm"
                        />
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <Metric label="Indexed docs" value={String(selectedApplication.contextDocumentCount || 0)} />
                    <Metric label="Last indexed" value={formatTimestamp(selectedApplication.contextLastIndexedAt)} />
                    <Metric label="Last delete" value={formatTimestamp(selectedApplication.contextLastDeleteAcceptedAt)} />
                    <Metric
                      label="Context error"
                      value={selectedApplication.contextLastError || 'None'}
                      tone={selectedApplication.contextLastError ? 'error' : 'muted'}
                      subtitle={selectedApplication.contextLastError ? formatTimestamp(selectedApplication.contextLastErrorAt) : undefined}
                    />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]"
                      onClick={() => {
                        setAuditApplicationId(selectedApplication.applicationId);
                        setActiveView('context');
                      }}
                    >
                      Open Audit
                    </button>
                    <button
                      className="px-4 py-2 rounded-md bg-[#3a1f23] text-[#fecaca] hover:bg-[#4d272d] disabled:opacity-50"
                      onClick={() => deleteContextDocuments(selectedApplication.applicationId)}
                      disabled={isBusy || (selectedApplication.contextDocumentCount || 0) === 0}
                    >
                      Delete Indexed Documents
                    </button>
                  </div>
                </div>

                <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <h2 className="text-xl font-semibold">Watch Folders</h2>
                    <button
                      className="px-3 py-1.5 rounded-md bg-[#2d3745] hover:bg-[#3b4655] text-sm disabled:opacity-50"
                      onClick={() => loadFolders(selectedApplication.applicationId)}
                      disabled={isBusy || loadingFolders || selectedApplication.status !== 'connected'}
                    >
                      {loadingFolders ? 'Loading…' : 'Load Folders'}
                    </button>
                  </div>
                  {availableFolders ? (
                    availableFolders.length === 0 ? (
                      <p className="text-sm text-[#aab4c2]">No folders found.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {availableFolders.map((folder) => {
                          const isOutlook = selectedApplication.providerId === 'microsoft-outlook';
                          const checked = selectedApplication.watchedFolders?.some((wf) => wf.id === folder.id) ?? false;
                          return (
                            <label key={folder.id} className="inline-flex items-center gap-3 text-sm text-[#d1d5db]">
                              <input
                                type={isOutlook ? 'radio' : 'checkbox'}
                                name={isOutlook ? `watch-folder-${selectedApplication.applicationId}` : undefined}
                                checked={checked}
                                onChange={() => {
                                  const currentIds = (selectedApplication.watchedFolders || []).map((wf) => wf.id);
                                  const next = isOutlook
                                    ? checked ? [] : [folder.id]
                                    : checked
                                      ? currentIds.filter((id) => id !== folder.id)
                                      : [...currentIds, folder.id];
                                  updateWatchedFolderIds(selectedApplication.applicationId, next.length > 0 ? next : null);
                                }}
                                disabled={isBusy}
                                className="h-4 w-4 accent-[#0d9488]"
                              />
                              {folder.name}
                            </label>
                          );
                        })}
                      </div>
                    )
                  ) : selectedApplication.watchedFolders && selectedApplication.watchedFolders.length > 0 ? (
                    <p className="text-sm text-[#aab4c2]">
                      Watching: {selectedApplication.watchedFolders.map((wf) => wf.name).join(', ')} — click &quot;Load Folders&quot; to change.
                    </p>
                  ) : (
                    <p className="text-sm text-[#aab4c2]">Watching default folder (Inbox). Click &quot;Load Folders&quot; to customize.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-8 text-center text-[#aab4c2]">
                Select or create a mailbox.
              </div>
            )}
          </section>
        </main>
      ) : activeView === 'context' ? (
        <ContextAuditView
          applications={applications}
          applicationId={auditApplicationId}
          setApplicationId={setAuditApplicationId}
          status={auditStatus}
          setStatus={setAuditStatus}
          documents={contextDocuments}
          deletionRuns={contextDeletionRuns}
          documentsCursor={contextDocumentsCursor}
          deletionRunsCursor={contextDeletionRunsCursor}
          onRefresh={() => loadContextAudit()}
          onLoadMoreDocuments={loadMoreContextDocuments}
          onLoadMoreDeletions={loadMoreContextDeletions}
          onOpenProviderDocument={openContextDocumentInProvider}
          onToggleIndexing={updateContextIndexing}
          onDeleteDocuments={deleteContextDocuments}
          busy={isBusy}
        />
      ) : (
        <ActionsView
          applications={applications}
          applicationId={actionApplicationId}
          setApplicationId={setActionApplicationId}
          status={actionStatus}
          setStatus={setActionStatus}
          actions={actions}
          actionsCursor={actionsCursor}
          selectedActionId={selectedActionId}
          executions={actionExecutions}
          onRefresh={() => loadActions()}
          onLoadMore={loadMoreActions}
          onSelectAction={loadActionExecutions}
          onExecuteAction={executeAction}
          busy={isBusy}
        />
      )}

      {confirmDelete &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Confirm delete application"
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="fixed inset-0 bg-black/60" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-[#111827] border border-[#374151] rounded-lg p-5 w-80 shadow-xl">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[#3a1f23] mb-4 mx-auto">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fecaca" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <p className="text-sm text-[#e5e7eb] text-center mb-5">
                Delete <span className="font-medium text-white">{confirmDelete.displayName}</span>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(null);
                  }}
                  className="flex-1 px-4 py-2 rounded-md bg-transparent text-[#9ca3af] border border-[#374151] hover:bg-[#1f2937] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const { applicationId } = confirmDelete;
                    setConfirmDelete(null);
                    deleteApplication(applicationId);
                  }}
                  className="flex-1 px-4 py-2 rounded-md bg-[#dc2626] text-white hover:bg-[#b91c1c] transition-colors font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'connected' | 'error' }) {
  const className =
    status === 'connected'
      ? 'bg-[#12362f] text-[#6ee7b7]'
      : status === 'error'
        ? 'bg-[#3a1f23] text-[#fecaca]'
        : 'bg-[#3b2f16] text-[#fbbf24]';
  return <span className={`px-2 py-1 rounded text-xs font-medium ${className}`}>{status.toUpperCase()}</span>;
}

function WatchBadge({ status }: { status: 'active' | 'stopped' | 'error' }) {
  const className =
    status === 'active'
      ? 'bg-[#12362f] text-[#6ee7b7]'
      : status === 'error'
        ? 'bg-[#3a1f23] text-[#fecaca]'
        : 'bg-[#2d3745] text-[#cbd5e1]';
  return <span className={`px-2 py-1 rounded text-xs font-medium ${className}`}>{status.toUpperCase()}</span>;
}

function ContextBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${enabled ? 'bg-[#12362f] text-[#6ee7b7]' : 'bg-[#2d3745] text-[#cbd5e1]'}`}>
      CONTEXT {enabled ? 'ON' : 'OFF'}
    </span>
  );
}

function ActionStatusBadge({ status }: { status: EmailActionStatus }) {
  const className =
    status === 'succeeded'
      ? 'bg-[#12362f] text-[#6ee7b7]'
      : status === 'failed' || status === 'expired'
        ? 'bg-[#3a1f23] text-[#fecaca]'
        : status === 'executing'
          ? 'bg-[#1e3a5f] text-[#bfdbfe]'
          : 'bg-[#3b2f16] text-[#fbbf24]';
  return <span className={`px-2 py-1 rounded text-xs font-medium ${className}`}>{status.toUpperCase()}</span>;
}

function ActionsView({
  applications,
  applicationId,
  setApplicationId,
  status,
  setStatus,
  actions,
  actionsCursor,
  selectedActionId,
  executions,
  onRefresh,
  onLoadMore,
  onSelectAction,
  onExecuteAction,
  busy,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (applicationId: string) => void;
  status: EmailActionStatus | '';
  setStatus: (status: EmailActionStatus | '') => void;
  actions: EmailAction[];
  actionsCursor?: string | undefined;
  selectedActionId: string;
  executions: EmailActionExecution[];
  onRefresh: () => void;
  onLoadMore: () => void;
  onSelectAction: (actionId: string) => void;
  onExecuteAction: (actionId: string) => void;
  busy: boolean;
}) {
  const selectedAction = actions.find((action) => action.actionId === selectedActionId);
  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Actions</h1>
          <p className="text-sm text-[#aab4c2] mt-1">Review AI-proposed actions, execution results, audit trail, and expiry.</p>
        </div>
        <button className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onRefresh} disabled={busy}>
          Refresh
        </button>
      </div>

      <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5 flex flex-col md:flex-row gap-4">
        <label className="text-sm text-[#d1d5db] flex flex-col gap-2">
          Mailbox
          <select
            value={applicationId}
            onChange={(event) => setApplicationId(event.target.value)}
            className="px-3 py-2 rounded bg-[#0e131b] border border-[#2d3745] text-white"
          >
            <option value="">All mailboxes</option>
            {applications.map((application) => (
              <option key={application.applicationId} value={application.applicationId}>
                {application.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[#d1d5db] flex flex-col gap-2">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as EmailActionStatus | '')}
            className="px-3 py-2 rounded bg-[#0e131b] border border-[#2d3745] text-white"
          >
            <option value="">All statuses</option>
            {['pending', 'executing', 'succeeded', 'failed', 'expired', 'cancelled'].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <section className="rounded-md border border-[#2d3745] bg-[#171c25] overflow-hidden">
          <div className="p-5 border-b border-[#2d3745] flex items-center justify-between">
            <h2 className="text-xl font-semibold">Action Items</h2>
            <span className="text-sm text-[#aab4c2]">{actions.length} loaded</span>
          </div>
          <div className="divide-y divide-[#2d3745]">
            {actions.map((action) => (
              <button
                key={action.actionId}
                onClick={() => onSelectAction(action.actionId)}
                className={`w-full text-left p-5 hover:bg-[#1d2430] ${selectedActionId === action.actionId ? 'bg-[#17221f]' : ''}`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-white truncate">{action.title}</div>
                    <div className="text-sm text-[#aab4c2] mt-1">{action.description}</div>
                    <div className="text-xs text-[#7d8896] mt-2">
                      {action.actionType} / expires {formatExpiryTimestamp(action.expiresAt)} / updated {formatTimestamp(action.updatedAt)}
                    </div>
                  </div>
                  <ActionStatusBadge status={action.status} />
                </div>
              </button>
            ))}
            {actions.length === 0 && <div className="p-8 text-center text-[#aab4c2]">No actions found.</div>}
          </div>
          {actionsCursor && (
            <div className="p-4 border-t border-[#2d3745]">
              <button className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onLoadMore} disabled={busy}>
                Load More
              </button>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          {selectedAction ? (
            <>
              <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedAction.title}</h2>
                    <p className="text-sm text-[#aab4c2] mt-1">{selectedAction.description}</p>
                  </div>
                  <ActionStatusBadge status={selectedAction.status} />
                </div>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <Metric label="Type" value={selectedAction.actionType} />
                  <Metric label="Risk" value={selectedAction.riskLevel} />
                  <Metric label="Expires" value={formatExpiryTimestamp(selectedAction.expiresAt)} />
                  <Metric label="Executed" value={formatTimestamp(selectedAction.executedAt)} />
                </div>
                <ActionPayloadDetails action={selectedAction} />
                {selectedAction.result && (
                  <div className="rounded bg-[#0e131b] border border-[#2d3745] p-3 text-sm">
                    <div className="font-medium text-white mb-1">Result</div>
                    <div className="text-[#d1d5db]">{selectedAction.result.summary}</div>
                    {(selectedAction.result.providerUrl || selectedAction.result.externalUrl) && (
                      <a
                        className="inline-block mt-2 text-[#6ee7b7] hover:underline"
                        href={selectedAction.result.providerUrl || selectedAction.result.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open result
                      </a>
                    )}
                  </div>
                )}
                {selectedAction.errorMessage && <div className="text-sm text-[#fca5a5]">{selectedAction.errorMessage}</div>}
                <button
                  className="px-4 py-2 rounded-md bg-[#0f766e] hover:bg-[#0d9488] disabled:opacity-50"
                  disabled={busy || selectedAction.status !== 'pending'}
                  onClick={() => onExecuteAction(selectedAction.actionId)}
                >
                  Execute From UI
                </button>
              </div>

              <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Audit</h2>
                  <button className="px-3 py-1.5 rounded-md bg-[#2d3745] hover:bg-[#3b4655] text-sm" onClick={() => onSelectAction(selectedAction.actionId)}>
                    Refresh Audit
                  </button>
                </div>
                <div className="space-y-3">
                  {executions.map((execution) => (
                    <div key={execution.executionId} className="rounded bg-[#0e131b] border border-[#2d3745] p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white">Attempt {execution.attempt}</span>
                        <ActionStatusBadge status={execution.status} />
                      </div>
                      <div className="text-[#aab4c2] mt-1">{execution.triggeredBy} / {formatTimestamp(execution.createdAt)}</div>
                      {execution.providerOperationId && <div className="text-[#7d8896] mt-1">Provider ID: {execution.providerOperationId}</div>}
                      {execution.errorMessage && <div className="text-[#fca5a5] mt-1">{execution.errorMessage}</div>}
                    </div>
                  ))}
                  {executions.length === 0 && <div className="text-sm text-[#aab4c2]">No execution attempts recorded.</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-8 text-center text-[#aab4c2]">Select an action.</div>
          )}
        </aside>
      </div>
    </main>
  );
}

function ActionPayloadDetails({ action }: { action: EmailAction }) {
  const payload = action.payload;
  if (payload.type === 'calendar.add_event') {
    return (
      <div className="rounded bg-[#0e131b] border border-[#2d3745] p-3 text-sm text-[#d1d5db]">
        <div className="font-medium text-white mb-1">Calendar Event</div>
        <div>{String(payload.eventTitle || action.title)}</div>
        <div>{String(payload.startTime || '')} to {String(payload.endTime || '')}</div>
        {payload.location ? <div>{String(payload.location)}</div> : null}
      </div>
    );
  }
  if (payload.type === 'email.draft_reply') {
    return (
      <div className="rounded bg-[#0e131b] border border-[#2d3745] p-3 text-sm text-[#d1d5db]">
        <div className="font-medium text-white mb-1">Draft Reply</div>
        <pre className="whitespace-pre-wrap font-sans">{String(payload.draftBody || '')}</pre>
      </div>
    );
  }
  if (payload.type === 'external.open_link') {
    return (
      <div className="rounded bg-[#0e131b] border border-[#2d3745] p-3 text-sm text-[#d1d5db]">
        <div className="font-medium text-white mb-1">External Link</div>
        <div className="break-all">{String(payload.url || '')}</div>
      </div>
    );
  }
  return (
    <div className="rounded bg-[#0e131b] border border-[#2d3745] p-3 text-sm text-[#d1d5db]">
      <div className="font-medium text-white mb-1">Manual Todo</div>
      <div>{String(payload.instructions || action.description)}</div>
    </div>
  );
}

function ContextAuditView({
  applications,
  applicationId,
  setApplicationId,
  status,
  setStatus,
  documents,
  deletionRuns,
  documentsCursor,
  deletionRunsCursor,
  onRefresh,
  onLoadMoreDocuments,
  onLoadMoreDeletions,
  onOpenProviderDocument,
  onToggleIndexing,
  onDeleteDocuments,
  busy,
}: {
  applications: ConnectedApplication[];
  applicationId: string;
  setApplicationId: (applicationId: string) => void;
  status: ApplicationContextDocumentStatus | '';
  setStatus: (status: ApplicationContextDocumentStatus | '') => void;
  documents: ApplicationContextDocument[];
  deletionRuns: ApplicationContextDeletionRun[];
  documentsCursor?: string | undefined;
  deletionRunsCursor?: string | undefined;
  onRefresh: () => void;
  onLoadMoreDocuments: () => void;
  onLoadMoreDeletions: () => void;
  onOpenProviderDocument: (contextDocumentId: string) => void;
  onToggleIndexing: (applicationId: string, contextIndexingEnabled: boolean) => void;
  onDeleteDocuments: (applicationId: string) => void;
  busy: boolean;
}) {
  const selectedApplication = applications.find((application) => application.applicationId === applicationId);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <section className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Context Audit</h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[220px_180px_auto] gap-3">
            <select
              value={applicationId}
              onChange={(event) => setApplicationId(event.target.value)}
              className="px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            >
              <option value="">All applications</option>
              {applications.map((application) => (
                <option key={application.applicationId} value={application.applicationId}>
                  {application.displayName}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ApplicationContextDocumentStatus | '')}
              className="px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
            >
              <option value="">ALL STATUSES</option>
              <option value="active">ACTIVE</option>
              <option value="deleted">DELETED</option>
              <option value="error">ERROR</option>
            </select>
            <button className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onRefresh}>
              Refresh
            </button>
          </div>
        </div>
      </section>

      {selectedApplication && (
        <section className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold truncate">{selectedApplication.displayName}</h2>
                <ContextBadge enabled={selectedApplication.contextIndexingEnabled} />
              </div>
              <div className="text-sm text-[#aab4c2] mt-1">
                {selectedApplication.contextDocumentCount || 0} active documents / last indexed{' '}
                {formatTimestamp(selectedApplication.contextLastIndexedAt)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655] disabled:opacity-50"
                onClick={() => onToggleIndexing(selectedApplication.applicationId, !selectedApplication.contextIndexingEnabled)}
                disabled={busy}
              >
                {selectedApplication.contextIndexingEnabled ? 'Disable Indexing' : 'Enable Indexing'}
              </button>
              <button
                className="px-4 py-2 rounded-md bg-[#3a1f23] text-[#fecaca] hover:bg-[#4d272d] disabled:opacity-50"
                onClick={() => onDeleteDocuments(selectedApplication.applicationId)}
                disabled={busy || (selectedApplication.contextDocumentCount || 0) === 0}
              >
                Delete Documents
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5 min-w-0">
          <h2 className="text-xl font-semibold mb-4">Indexed Documents</h2>
          <div className="space-y-3">
            {documents.map((document) => (
              <ContextDocumentRow
                key={document.contextDocumentId}
                document={document}
                application={applications.find((item) => item.applicationId === document.applicationId)}
                onOpenProviderDocument={onOpenProviderDocument}
              />
            ))}
            {documents.length === 0 && <div className="p-5 rounded-md bg-[#11161f] text-[#aab4c2]">No context documents found.</div>}
          </div>
          {documentsCursor && (
            <button className="mt-4 px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onLoadMoreDocuments}>
              Load More Documents
            </button>
          )}
        </div>

        <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5 min-w-0">
          <h2 className="text-xl font-semibold mb-4">Deletion History</h2>
          <div className="space-y-3">
            {deletionRuns.map((run) => (
              <ContextDeletionRunRow
                key={run.deletionRunId}
                run={run}
                application={applications.find((item) => item.applicationId === run.applicationId)}
              />
            ))}
            {deletionRuns.length === 0 && <div className="p-5 rounded-md bg-[#11161f] text-[#aab4c2]">No deletion history found.</div>}
          </div>
          {deletionRunsCursor && (
            <button className="mt-4 px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onLoadMoreDeletions}>
              Load More Deletions
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function ContextDocumentRow({
  document,
  application,
  onOpenProviderDocument,
}: {
  document: ApplicationContextDocument;
  application: ConnectedApplication | undefined;
  onOpenProviderDocument: (contextDocumentId: string) => void;
}) {
  const statusClass =
    document.status === 'active'
      ? 'bg-[#12362f] text-[#6ee7b7]'
      : document.status === 'error'
        ? 'bg-[#3a1f23] text-[#fecaca]'
        : 'bg-[#2d3745] text-[#cbd5e1]';
  return (
    <article className="rounded-md border border-[#2d3745] bg-[#11161f] p-4 min-w-0">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">Document {formatFingerprint(document.sourceDocumentFingerprint)}</div>
          <div className="text-sm text-[#aab4c2] truncate">
            {application?.displayName || document.applicationId} / {providerLabels[document.sourceProviderId]} / {document.indexedTextChars}{' '}
            chars indexed
          </div>
          <div className="text-xs text-[#7d8896] mt-1">
            Indexed {formatTimestamp(document.indexedAt)} / Updated {formatTimestamp(document.updatedAt)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded-md bg-[#2d3745] hover:bg-[#3b4655] disabled:opacity-50 text-sm"
            onClick={() => onOpenProviderDocument(document.contextDocumentId)}
            disabled={document.status === 'deleted'}
          >
            Open Provider
          </button>
          <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass}`}>{document.status.toUpperCase()}</span>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <AuditValue label="Content" value={formatFingerprint(document.contentFingerprint)} />
        <AuditValue label="Thread" value={formatFingerprint(document.sourceThreadFingerprint)} />
        <AuditValue label="Title" value={formatFingerprint(document.titleFingerprint)} />
        <AuditValue label="Sender" value={formatFingerprint(document.senderFingerprint)} />
      </div>
      {document.lastError && <div className="mt-3 text-sm text-[#fca5a5] break-words">{document.lastError}</div>}
    </article>
  );
}

function AuditValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#0d1118] border border-[#2d3745] p-3 min-w-0">
      <div className="text-xs uppercase tracking-normal text-[#7d8896]">{label}</div>
      <div className="mt-1 font-mono text-xs text-[#d1d5db] break-all">{value}</div>
    </div>
  );
}

function formatFingerprint(value?: string | null): string {
  return value ? value.slice(0, 16) : 'not available';
}

function ContextDeletionRunRow({
  run,
  application,
}: {
  run: ApplicationContextDeletionRun;
  application: ConnectedApplication | undefined;
}) {
  const statusClass = run.status === 'accepted' ? 'bg-[#12362f] text-[#6ee7b7]' : 'bg-[#3a1f23] text-[#fecaca]';
  return (
    <article className="rounded-md border border-[#2d3745] bg-[#11161f] p-4 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{application?.displayName || run.applicationId}</div>
          <div className="text-sm text-[#aab4c2]">
            {run.deletedVectorCount}/{run.requestedVectorCount} vectors accepted
          </div>
          <div className="text-xs text-[#7d8896] mt-1">{formatTimestamp(run.createdAt)}</div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass}`}>{run.status.toUpperCase()}</span>
      </div>
      {run.mutationIds.length > 0 && <div className="mt-3 text-xs text-[#7d8896] break-words">Mutations: {run.mutationIds.join(', ')}</div>}
      {run.errorMessage && <div className="mt-3 text-sm text-[#fca5a5] break-words">{run.errorMessage}</div>}
    </article>
  );
}

function ReadOnlyField({ label, value, showCopy = false }: { label: string; value: string; showCopy?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <label className="block">
      <span className="block text-sm text-[#aab4c2] mb-2">{label}</span>
      <div className="flex">
        <input
          readOnly
          value={value}
          className="min-w-0 px-3 py-2 rounded-l-md bg-[#0d1118] border border-[#2d3745] border-r-0 text-[#d1d5db] flex-1"
        />
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 rounded-r-md bg-[#2d3745] hover:bg-[#3d4a5c] border border-[#2d3745] text-[#d1d5db] text-sm"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </label>
  );
}

function Metric({ label, value, tone = 'muted', subtitle }: { label: string; value: string; tone?: 'muted' | 'error'; subtitle?: string }) {
  return (
    <div className="rounded-md border border-[#2d3745] bg-[#11161f] p-4 min-w-0">
      <div className="text-xs uppercase tracking-normal text-[#7d8896]">{label}</div>
      <div className={`mt-2 break-words ${tone === 'error' ? 'text-[#fca5a5]' : 'text-[#d1d5db]'}`}>{value}</div>
      {subtitle && <div className="mt-1 text-xs text-[#7d8896]">{subtitle}</div>}
    </div>
  );
}

function ApplicationForm({
  form,
  setForm,
  onSave,
  onCancel,
  busy,
}: {
  form: ApplicationFormState;
  setForm: (form: ApplicationFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const update = (changes: Partial<ApplicationFormState>) => setForm({ ...form, ...changes });

  return (
    <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
      <h2 className="text-lg font-semibold mb-4">{form.applicationId ? 'Edit Mailbox' : 'New Mailbox'}</h2>
      <div className="space-y-3">
        <input
          value={form.displayName}
          onChange={(event) => update({ displayName: event.target.value })}
          placeholder="Display name"
          className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
        />
        <select
          value={form.providerId}
          onChange={(event) => update({ providerId: event.target.value as ProviderId })}
          disabled={Boolean(form.applicationId)}
          className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white disabled:opacity-60"
        >
          <option value="google-gmail">Google Gmail / OAuth2</option>
          <option value="microsoft-outlook">Microsoft Outlook / OAuth2</option>
        </select>
        <input
          value={form.clientId}
          onChange={(event) => update({ clientId: event.target.value })}
          placeholder="OAuth2 client ID"
          className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
        />
        <input
          value={form.clientSecret}
          onChange={(event) => update({ clientSecret: event.target.value })}
          placeholder="OAuth2 client secret"
          type="password"
          className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
        />
        {form.providerId === 'google-gmail' && (
          <input
            value={form.gmailPubsubTopicName}
            onChange={(event) => update({ gmailPubsubTopicName: event.target.value })}
            placeholder="projects/{projectId}/topics/{topicName}"
            className="w-full px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-white"
          />
        )}
        <div className="flex gap-2">
          <button
            className="flex-1 px-4 py-2 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50"
            onClick={onSave}
            disabled={busy}
          >
            Save
          </button>
          <button className="px-4 py-2 rounded-md bg-[#2d3745] hover:bg-[#3b4655]" onClick={onCancel} disabled={busy}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
