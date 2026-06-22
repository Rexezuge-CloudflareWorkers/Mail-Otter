import { useEffect, useState } from 'react';
import type { OutboundIntegration, OutboundIntegrationType } from '../../../components/types';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

const TYPE_LABELS: Record<OutboundIntegrationType, string> = {
  slack: 'Slack',
  discord: 'Discord',
  webhook: 'Webhook',
};

const WEBHOOK_URL_LABEL: Record<OutboundIntegrationType, string> = {
  slack: 'Slack Webhook URL',
  discord: 'Discord Webhook URL',
  webhook: 'Endpoint URL',
};

function IntegrationRow({ integration }: { integration: OutboundIntegration }) {
  const { busy, onUpdateIntegration, onDeleteIntegration, onTestIntegration } = useMailboxCallbacks();

  const handleToggle = async () => {
    await onUpdateIntegration(integration.integrationId, { enabled: !integration.enabled });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete Integration "${integration.name}"?`)) return;
    await onDeleteIntegration(integration.integrationId);
  };

  const handleTest = async () => {
    await onTestIntegration(integration.integrationId);
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] uppercase">
        {TYPE_LABELS[integration.integrationType as OutboundIntegrationType] ?? integration.integrationType}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{integration.name}</p>
        <p className="text-xs text-[var(--color-text-muted)] truncate">{integration.maskedWebhookUrl}</p>
      </div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
          integration.enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
        } disabled:opacity-50`}
        title={integration.enabled ? 'Disable Integration' : 'Enable Integration'}
      >
        <span
          className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${
            integration.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <Button size="sm" variant="ghost" onClick={handleTest} disabled={busy}>
        Test
      </Button>
      <Button size="sm" variant="ghost" onClick={handleDelete} disabled={busy} className="text-[var(--color-error)]">
        Delete
      </Button>
    </div>
  );
}

function AddIntegrationForm({ applicationId, onCancel }: { applicationId: string; onCancel: () => void }) {
  const { busy, onCreateIntegration } = useMailboxCallbacks();
  const [integrationType, setIntegrationType] = useState<OutboundIntegrationType>('slack');
  const [name, setName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedUrl = webhookUrl.trim();
    if (!trimmedName || !trimmedUrl) return;
    await onCreateIntegration(applicationId, integrationType, trimmedName, trimmedUrl);
    onCancel();
  };

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
      <div className="flex gap-2">
        <select
          value={integrationType}
          onChange={(e) => setIntegrationType(e.target.value as OutboundIntegrationType)}
          disabled={busy}
          className="text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
          <option value="webhook">Webhook</option>
        </select>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Integration Name"
          disabled={busy}
          className="flex-1"
        />
      </div>
      <Input
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
        placeholder={WEBHOOK_URL_LABEL[integrationType]}
        disabled={busy}
        type="url"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy || !name.trim() || !webhookUrl.trim()}>
          Save Integration
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsSection({ applicationId }: { applicationId: string }) {
  const { integrationsByApplicationId, loadingIntegrations, onLoadIntegrations } = useMailboxCallbacks();
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    onLoadIntegrations(applicationId).catch(() => {});
  }, [applicationId]);

  const integrations: OutboundIntegration[] = integrationsByApplicationId[applicationId] ?? [];
  const atLimit = integrations.length >= 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outbound Integrations</CardTitle>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Forward email summaries to Slack, Discord, or a custom webhook.
        </p>
      </CardHeader>
      <div className="px-4 pb-4">
        {loadingIntegrations && integrations.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
        ) : integrations.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No Integrations Configured.</p>
        ) : (
          <div>
            {integrations.map((integration) => (
              <IntegrationRow key={integration.integrationId} integration={integration} />
            ))}
          </div>
        )}
        {!showAddForm && !atLimit && (
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)} className="mt-3">
            + Add Integration
          </Button>
        )}
        {atLimit && !showAddForm && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">Maximum of 5 integrations reached.</p>
        )}
        {showAddForm && (
          <AddIntegrationForm applicationId={applicationId} onCancel={() => setShowAddForm(false)} />
        )}
      </div>
    </Card>
  );
}
