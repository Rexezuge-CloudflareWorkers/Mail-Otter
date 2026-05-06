import { useCallback, useEffect, useMemo, useState } from 'react';
import Unauthorized from '../components/Unauthorized';
import type {
  ApplicationContextDeletionRun,
  ApplicationContextDocument,
  ApplicationContextDocumentStatus,
  ConnectedApplication,
  CurrentUser,
  ProviderId,
} from '../components/types';
import { formatExpiryTimestamp, formatTimestamp, methodLabels, providerLabels, providerMethod, readJson } from '../components/utils';

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

type ActiveView = 'mailboxes' | 'context';

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

  const selectedApplication = useMemo(
    () => applications.find((application) => application.applicationId === selectedApplicationId),
    [applications, selectedApplicationId],
  );

  const showNotice = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const loadApplications = useCallback(async () => {
    const data = await readJson<{ applications: ConnectedApplication[] }>(await fetch('/user/applications'));
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
          await fetch(`/user/application/context/documents?${documentParams.toString()}`),
        ),
        readJson<{ deletionRuns: ApplicationContextDeletionRun[]; nextCursor?: string }>(
          await fetch(`/user/application/context/deletions?${deletionParams.toString()}`),
        ),
      ]);
      setContextDocuments((current) => (append ? [...current, ...documentData.documents] : documentData.documents));
      setContextDocumentsCursor(documentData.nextCursor);
      setContextDeletionRuns((current) => (append ? [...current, ...deletionData.deletionRuns] : deletionData.deletionRuns));
      setContextDeletionRunsCursor(deletionData.nextCursor);
    },
    [auditApplicationId, auditStatus],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const me = await readJson<CurrentUser>(await fetch('/user/me'));
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
      const response = await fetch('/user/application', {
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
        await fetch('/user/application', {
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
        await fetch('/user/application/oauth2/authorize', {
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
        await fetch('/user/application/watch', {
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
        await fetch('/user/application/stop', {
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
        await fetch('/user/application/context', {
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

  const deleteContextDocuments = async (applicationId: string) => {
    const application = applications.find((item) => item.applicationId === applicationId);
    if (!window.confirm(`Delete all indexed documents for ${application?.displayName || 'this application'}?`)) return;
    setIsBusy(true);
    try {
      const data = await readJson<{ deletionRun: ApplicationContextDeletionRun }>(
        await fetch('/user/application/context/delete-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId }),
        }),
      );
      await loadApplications();
      if (activeView === 'context') await loadContextAudit();
      showNotice(
        data.deletionRun.status === 'accepted' ? 'success' : 'error',
        data.deletionRun.status === 'accepted' ? 'Context documents deletion accepted.' : data.deletionRun.errorMessage || 'Context deletion failed.',
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
      await fetch(`/user/application/context/documents?${params.toString()}`),
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
      await fetch(`/user/application/context/deletions?${params.toString()}`),
    );
    setContextDeletionRuns((current) => [...current, ...data.deletionRuns]);
    setContextDeletionRunsCursor(data.nextCursor);
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
                      onClick={() => deleteApplication(selectedApplication.applicationId)}
                      disabled={isBusy}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4">
                  <ReadOnlyField label="OAuth2 redirect URI" value={selectedApplication.oauth2RedirectUri || ''} />
                  {selectedApplication.providerId === 'google-gmail' && (
                    <ReadOnlyField label="Gmail Pub/Sub topic" value={selectedApplication.gmailPubsubTopicName || ''} />
                  )}
                  <ReadOnlyField label="Webhook endpoint" value={watchWebhookUrl || selectedApplication.webhookUrl || ''} />
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
                    disabled={isBusy || selectedApplication.status !== 'connected'}
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
                  <Metric label="Last error" value={selectedApplication.lastError || 'None'} tone={selectedApplication.lastError ? 'error' : 'muted'} />
                </div>
              </div>

              <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">Context</h2>
                  </div>
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
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <Metric label="Indexed docs" value={String(selectedApplication.contextDocumentCount || 0)} />
                  <Metric label="Last indexed" value={formatTimestamp(selectedApplication.contextLastIndexedAt)} />
                  <Metric label="Last delete" value={formatTimestamp(selectedApplication.contextLastDeleteAcceptedAt)} />
                  <Metric
                    label="Context error"
                    value={selectedApplication.contextLastError || 'None'}
                    tone={selectedApplication.contextLastError ? 'error' : 'muted'}
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
            </>
          ) : (
            <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-8 text-center text-[#aab4c2]">
              Select or create a mailbox.
            </div>
          )}
        </section>
      </main>
      ) : (
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
          onToggleIndexing={updateContextIndexing}
          onDeleteDocuments={deleteContextDocuments}
          busy={isBusy}
        />
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
  return <span className={`px-2 py-1 rounded text-xs font-medium ${className}`}>{status}</span>;
}

function WatchBadge({ status }: { status: 'active' | 'stopped' | 'error' }) {
  const className =
    status === 'active' ? 'bg-[#12362f] text-[#6ee7b7]' : status === 'error' ? 'bg-[#3a1f23] text-[#fecaca]' : 'bg-[#2d3745] text-[#cbd5e1]';
  return <span className={`px-2 py-1 rounded text-xs font-medium ${className}`}>{status}</span>;
}

function ContextBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${enabled ? 'bg-[#12362f] text-[#6ee7b7]' : 'bg-[#2d3745] text-[#cbd5e1]'}`}>
      context {enabled ? 'on' : 'off'}
    </span>
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
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="deleted">Deleted</option>
              <option value="error">Error</option>
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
}: {
  document: ApplicationContextDocument;
  application: ConnectedApplication | undefined;
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
          <div className="font-medium truncate">{document.title || '(untitled)'}</div>
          <div className="text-sm text-[#aab4c2] truncate">
            {application?.displayName || document.applicationId} / {providerLabels[document.sourceProviderId]} / {document.sender || 'unknown sender'}
          </div>
          <div className="text-xs text-[#7d8896] mt-1">
            Indexed {formatTimestamp(document.indexedAt)} / Updated {formatTimestamp(document.updatedAt)}
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass}`}>{document.status}</span>
      </div>
      {document.indexedText ? (
        <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#0d1118] border border-[#2d3745] p-3 text-sm text-[#d1d5db]">
          {document.indexedText}
        </pre>
      ) : (
        <div className="mt-4 rounded-md bg-[#0d1118] border border-[#2d3745] p-3 text-sm text-[#7d8896]">
          {document.lastError || 'Document text is not retained for this status.'}
        </div>
      )}
    </article>
  );
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
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusClass}`}>{run.status}</span>
      </div>
      {run.mutationIds.length > 0 && <div className="mt-3 text-xs text-[#7d8896] break-words">Mutations: {run.mutationIds.join(', ')}</div>}
      {run.errorMessage && <div className="mt-3 text-sm text-[#fca5a5] break-words">{run.errorMessage}</div>}
    </article>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="block text-sm text-[#aab4c2] mb-2">{label}</span>
      <input
        readOnly
        value={value}
        className="w-full min-w-0 px-3 py-2 rounded-md bg-[#0d1118] border border-[#2d3745] text-[#d1d5db]"
      />
    </label>
  );
}

function Metric({ label, value, tone = 'muted' }: { label: string; value: string; tone?: 'muted' | 'error' }) {
  return (
    <div className="rounded-md border border-[#2d3745] bg-[#11161f] p-4 min-w-0">
      <div className="text-xs uppercase tracking-normal text-[#7d8896]">{label}</div>
      <div className={`mt-2 break-words ${tone === 'error' ? 'text-[#fca5a5]' : 'text-[#d1d5db]'}`}>{value}</div>
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
