import { useCallback, useEffect, useMemo, useState } from 'react';
import Unauthorized from '../components/Unauthorized';
import type { ConnectedApplication, CurrentUser, ProviderId } from '../components/types';
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
            <div className="hidden md:flex items-center rounded-md bg-[#1a1f29] p-1 text-sm text-[#aab4c2]">
              <span className="px-3 py-1 rounded bg-[#2d3745] text-white">Mailboxes</span>
              <span className="px-3 py-1">Watches</span>
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
            </>
          ) : (
            <div className="rounded-md border border-[#2d3745] bg-[#171c25] p-8 text-center text-[#aab4c2]">
              Select or create a mailbox.
            </div>
          )}
        </section>
      </main>
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
