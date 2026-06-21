import type { ConnectedApplication, CurrentUser } from '../../../components/types';
import { formatTimestamp, formatExpiryTimestamp, providerLabels } from '../../../components/utils';
import { ConnectionBadge, WatchBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Metric } from '../shared/Metric';
import { ReadOnlyField } from '../shared/ReadOnlyField';
import { WatchSection } from './WatchSection';
import { ContextSection } from './ContextSection';
import { SenderFilterSection } from './SenderFilterSection';
import type { SenderDomainFilters } from '../../../components/types';

export function MailboxDetail({
  application,
  watchWebhookUrl,
  user,
  availableFolders,
  loadingFolders,
  busy,
  onEdit,
  onDelete,
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
  onDismissProcessingError,
  onDismissContextError,
}: {
  application: ConnectedApplication;
  watchWebhookUrl: string;
  user: CurrentUser;
  availableFolders: Array<{ id: string; name: string }> | null;
  loadingFolders: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onStartOAuth2: () => void;
  onStartWatch: () => void;
  onStopWatch: () => void;
  onLoadFolders: () => void;
  onUpdateWatchedFolders: (folderIds: string[] | null) => void;
  onUpdateSenderFilters: (filters: SenderDomainFilters) => void;
  onUpdateContextIndexing: (enabled: boolean) => void;
  onUpdateMaxContextDocuments: (max: number | null) => void;
  onOpenContextAudit: () => void;
  onDeleteContextDocuments: () => void;
  onDismissProcessingError: () => void;
  onDismissContextError: () => void;
}) {
  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Header card */}
      <Card>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)] truncate">{application.displayName}</h2>
              <ConnectionBadge status={application.status} />
              {application.watchStatus && <WatchBadge status={application.watchStatus} />}
            </div>
            <div className="text-sm text-[var(--color-text-secondary)]">
              {providerLabels[application.providerId]} · {application.providerEmail || 'Not Authorized'}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] mt-1">Updated {formatTimestamp(application.updatedAt)}</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={onEdit}>Edit</Button>
            <Button variant="danger" size="sm" onClick={onDelete} disabled={busy}>Delete</Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3">
          <ReadOnlyField label="OAuth2 Redirect URI" value={application.oauth2RedirectUri || ''} showCopy />
          {application.providerId === 'google-gmail' && (
            <ReadOnlyField label="Gmail Pub/Sub Topic" value={application.gmailPubsubTopicName || ''} />
          )}
          <ReadOnlyField label="Webhook Endpoint" value={watchWebhookUrl || application.webhookUrl || ''} showCopy />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant={application.status === 'connected' ? 'secondary' : 'primary'} size="sm" onClick={onStartOAuth2} disabled={busy}>
            {application.status === 'connected' ? 'Re-Authorize OAuth2' : 'Authorize OAuth2'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onStartWatch}
            disabled={busy || application.status !== 'connected' || application.watchStatus === 'active'}
          >
            Start Watch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onStopWatch}
            disabled={busy || application.watchStatus !== 'active'}
          >
            Stop Watch
          </Button>
        </div>
      </Card>

      {/* Processing metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Processing</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Metric label="Watch Expires" value={formatExpiryTimestamp(application.watchExpiresAt)} />
          <Metric label="Last Summary" value={formatTimestamp(application.lastSummaryAt)} />
          <Metric
            label="Last Error"
            value={application.lastError || 'None'}
            tone={application.lastError ? 'error' : 'muted'}
            subtitle={application.lastError ? formatTimestamp(application.lastErrorAt) : undefined}
            onDismiss={application.lastError ? onDismissProcessingError : undefined}
          />
        </div>
      </Card>

      {/* Context indexing */}
      <ContextSection
        application={application}
        user={user}
        busy={busy}
        onUpdateContextIndexing={onUpdateContextIndexing}
        onUpdateMaxContextDocuments={onUpdateMaxContextDocuments}
        onOpenContextAudit={onOpenContextAudit}
        onDeleteContextDocuments={onDeleteContextDocuments}
        onDismissContextError={onDismissContextError}
      />

      {/* Sender filter rules */}
      <SenderFilterSection
        filters={application.senderDomainFilters}
        busy={busy}
        onUpdate={onUpdateSenderFilters}
      />

      {/* Watch folders */}
      <WatchSection
        application={application}
        availableFolders={availableFolders}
        loadingFolders={loadingFolders}
        busy={busy}
        onLoadFolders={onLoadFolders}
        onUpdateWatchedFolders={onUpdateWatchedFolders}
      />
    </div>
  );
}

