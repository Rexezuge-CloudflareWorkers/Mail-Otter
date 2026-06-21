import type { ConnectedApplication, CurrentUser, SenderDomainFilters } from '../../../components/types';
import { MailboxCard } from '../mailboxes/MailboxCard';
import { MailboxDetail } from '../mailboxes/MailboxDetail';
import type { ApplicationFormState } from '../mailboxes/MailboxForm';
import { MailboxForm } from '../mailboxes/MailboxForm';
import { Card } from '../ui/Card';

export function MailboxesView({
  applications,
  selectedApplicationId,
  onSelectApplication,
  user,
  watchWebhookUrl,
  availableFolders,
  loadingFolders,
  busy,
  applicationForm,
  setApplicationForm,
  onSaveForm,
  onCancelForm,
  onEditApplication,
  onDeleteApplication,
  onStartOAuth2,
  onStartWatch,
  onStopWatch,
  onLoadFolders,
  onUpdateWatchedFolders,
  onUpdateSenderFilters,
  onUpdateContextIndexing,
  onUpdateMaxContextDocuments,
  onOpenContextAudit,
  onDeleteContextDocuments,
  isFormExpanded,
  setIsFormExpanded,
}: {
  applications: ConnectedApplication[];
  selectedApplicationId: string;
  onSelectApplication: (id: string) => void;
  user: CurrentUser;
  watchWebhookUrl: string;
  availableFolders: Array<{ id: string; name: string }> | null;
  loadingFolders: boolean;
  busy: boolean;
  applicationForm: ApplicationFormState;
  setApplicationForm: (form: ApplicationFormState) => void;
  onSaveForm: () => void;
  onCancelForm: () => void;
  onEditApplication: (app: ConnectedApplication) => void;
  onDeleteApplication: () => void;
  onStartOAuth2: (id: string) => void;
  onStartWatch: (id: string) => void;
  onStopWatch: (id: string) => void;
  onLoadFolders: (id: string) => void;
  onUpdateWatchedFolders: (id: string, folderIds: string[] | null) => void;
  onUpdateSenderFilters: (id: string, filters: SenderDomainFilters) => void;
  onUpdateContextIndexing: (id: string, enabled: boolean) => void;
  onUpdateMaxContextDocuments: (id: string, max: number | null) => void;
  onOpenContextAudit: (id: string) => void;
  onDeleteContextDocuments: (id: string) => void;
  isFormExpanded: boolean;
  setIsFormExpanded: (v: boolean) => void;
}) {
  const selectedApplication = applications.find((a) => a.applicationId === selectedApplicationId);

  return (
    <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-6 animate-fade-in-up">
      {/* Sidebar */}
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
              No mailboxes yet. Add one below.
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

      {/* Detail panel */}
      <section>
        {selectedApplication ? (
          <MailboxDetail
            application={selectedApplication}
            watchWebhookUrl={watchWebhookUrl}
            user={user}
            availableFolders={availableFolders}
            loadingFolders={loadingFolders}
            busy={busy}
            onEdit={() => onEditApplication(selectedApplication)}
            onDelete={onDeleteApplication}
            onStartOAuth2={() => onStartOAuth2(selectedApplication.applicationId)}
            onStartWatch={() => onStartWatch(selectedApplication.applicationId)}
            onStopWatch={() => onStopWatch(selectedApplication.applicationId)}
            onLoadFolders={() => onLoadFolders(selectedApplication.applicationId)}
            onUpdateWatchedFolders={(ids) => onUpdateWatchedFolders(selectedApplication.applicationId, ids)}
            onUpdateSenderFilters={(filters) => onUpdateSenderFilters(selectedApplication.applicationId, filters)}
            onUpdateContextIndexing={(enabled) => onUpdateContextIndexing(selectedApplication.applicationId, enabled)}
            onUpdateMaxContextDocuments={(max) => onUpdateMaxContextDocuments(selectedApplication.applicationId, max)}
            onOpenContextAudit={() => onOpenContextAudit(selectedApplication.applicationId)}
            onDeleteContextDocuments={() => onDeleteContextDocuments(selectedApplication.applicationId)}
          />
        ) : (
          <Card className="text-center text-[var(--color-text-muted)] py-16 text-sm">
            Select or create a mailbox to get started.
          </Card>
        )}
      </section>
    </main>
  );
}
