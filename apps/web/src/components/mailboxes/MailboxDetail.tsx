import type { ConnectedApplication } from '../../../components/types';
import { formatTimestamp, formatExpiryTimestamp, providerLabels } from '../../../components/utils';
import { ConnectionBadge, WatchBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Metric } from '../shared/Metric';
import { ReadOnlyField } from '../shared/ReadOnlyField';
import { WatchSection } from './WatchSection';
import { ContextSection } from './ContextSection';
import { SenderFilterSection } from './SenderFilterSection';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

export function MailboxDetail({
  application,
  watchWebhookUrl,
  availableFolders,
  loadingFolders,
}: {
  application: ConnectedApplication;
  watchWebhookUrl: string;
  availableFolders: Array<{ id: string; name: string }> | null;
  loadingFolders: boolean;
}) {
  const { busy, onEdit, onDelete, onStartOAuth2, onStartWatch, onStopWatch, onDismissProcessingError } = useMailboxCallbacks();

  return (
    <div className="space-y-4 animate-fade-in-up">
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
            <Button variant="secondary" size="sm" onClick={() => onEdit(application)}>Edit</Button>
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
          <Button
            variant={application.status === 'connected' ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => onStartOAuth2(application.applicationId)}
            disabled={busy}
          >
            {application.status === 'connected' ? 'Re-Authorize OAuth2' : 'Authorize OAuth2'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onStartWatch(application.applicationId)}
            disabled={busy || application.status !== 'connected' || application.watchStatus === 'active'}
          >
            Start Watch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStopWatch(application.applicationId)}
            disabled={busy || application.watchStatus !== 'active'}
          >
            Stop Watch
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Processing</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Metric
            label="Watch Expires"
            value={formatExpiryTimestamp(application.watchExpiresAt)}
            subtitle={application.watchExpiresAt ? 'Auto-Renews Automatically' : undefined}
          />
          <Metric label="Last Summary" value={formatTimestamp(application.lastSummaryAt)} />
          <Metric
            label="Last Error"
            value={application.lastError || 'None'}
            tone={application.lastError ? 'error' : 'muted'}
            subtitle={application.lastError ? formatTimestamp(application.lastErrorAt) : undefined}
            onDismiss={application.lastError ? () => onDismissProcessingError(application.applicationId) : undefined}
          />
        </div>
      </Card>

      <ContextSection application={application} />
      <SenderFilterSection application={application} />
      <WatchSection application={application} availableFolders={availableFolders} loadingFolders={loadingFolders} />
    </div>
  );
}
