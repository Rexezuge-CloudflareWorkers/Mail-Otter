import { useMemo } from 'react';
import type { ConnectedApplication } from '../../../components/types';
import { MailboxCard } from '../mailboxes/MailboxCard';
import { MailboxDetail } from '../mailboxes/MailboxDetail';
import type { ApplicationFormState } from '../mailboxes/MailboxForm';
import { MailboxForm } from '../mailboxes/MailboxForm';
import { Card } from '../ui/Card';
import { useCurrentUserData } from '../../contexts/UserContext';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

export function MailboxesView({
  applications,
  selectedApplicationId,
  onSelectApplication,
  watchWebhookUrl,
  availableFolders,
  loadingFolders,
  applicationForm,
  setApplicationForm,
  onSaveForm,
  onCancelForm,
  isFormExpanded,
  setIsFormExpanded,
}: {
  applications: ConnectedApplication[];
  selectedApplicationId: string;
  onSelectApplication: (id: string) => void;
  watchWebhookUrl: string;
  availableFolders: Array<{ id: string; name: string }> | null;
  loadingFolders: boolean;
  applicationForm: ApplicationFormState;
  setApplicationForm: (form: ApplicationFormState) => void;
  onSaveForm: () => void;
  onCancelForm: () => void;
  isFormExpanded: boolean;
  setIsFormExpanded: (v: boolean) => void;
}) {
  const user = useCurrentUserData();
  const { busy } = useMailboxCallbacks();
  const selectedApplication = useMemo(
    () => applications.find((a) => a.applicationId === selectedApplicationId),
    [applications, selectedApplicationId],
  );

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 animate-fade-in-up">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Connected Mailboxes</h1>
          <span className="text-sm text-[var(--color-text-muted)]">
            {applications.length}/{user.limits.maxApplicationsPerUser}
          </span>
        </div>

        <div className="space-y-2">
          {applications.map((app, i) => (
            <div
              key={app.applicationId}
              className={i === 0 ? 'animate-stagger-1' : i === 1 ? 'animate-stagger-2' : i === 2 ? 'animate-stagger-3' : 'animate-fade-in-up'}
            >
              <MailboxCard
                application={app}
                selected={app.applicationId === selectedApplicationId}
                onClick={() => onSelectApplication(app.applicationId)}
              />
            </div>
          ))}
          {applications.length === 0 && (
            <Card className="text-center text-[var(--color-text-muted)] text-sm py-8">
              No Mailboxes Yet. Add One Below.
            </Card>
          )}
        </div>

        <MailboxForm
          form={applicationForm}
          setForm={setApplicationForm}
          onSave={onSaveForm}
          onCancel={onCancelForm}
          busy={busy}
          isExpanded={isFormExpanded}
          onToggleExpand={() => setIsFormExpanded(!isFormExpanded)}
        />
      </section>

      <section>
        {selectedApplication ? (
          <MailboxDetail
            application={selectedApplication}
            watchWebhookUrl={watchWebhookUrl}
            availableFolders={availableFolders}
            loadingFolders={loadingFolders}
          />
        ) : (
          <Card className="text-center text-[var(--color-text-muted)] py-16 text-sm">
            Select Or Create A Mailbox To Get Started.
          </Card>
        )}
      </section>
    </main>
  );
}
