import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OutboundIntegration, OutboundIntegrationType } from '../../types';
import { Button } from '../ui/Button';
import { IntegrationHealthBadge } from '../ui/Badge';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Input } from '../ui/Input';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

const TYPE_LABELS: Record<OutboundIntegrationType, string> = {
  slack: 'Slack',
  discord: 'Discord',
  webhook: 'Webhook',
};

function IntegrationRow({ integration }: { integration: OutboundIntegration }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const { busy, onUpdateIntegration, onDeleteIntegration, onTestIntegration, onFetchDeliveryLogs } = useMailboxCallbacks();

  const handleToggle = async () => {
    await onUpdateIntegration(integration.integrationId, { enabled: !integration.enabled });
  };

  const handleDelete = async () => {
    if (!globalThis.confirm(t('integrations.deleteConfirm', 'Delete Integration "{{name}}"?', { name: integration.name }))) return;
    await onDeleteIntegration(integration.integrationId);
  };

  const handleTest = async () => {
    await onTestIntegration(integration.integrationId);
  };

  const typeLabels: Record<OutboundIntegrationType, string> = {
    slack: t('integrations.typeSlack', 'Slack'),
    discord: t('integrations.typeDiscord', 'Discord'),
    webhook: t('integrations.typeWebhook', 'Webhook'),
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)] text-[var(--color-text-muted)] uppercase">
        {typeLabels[integration.integrationType] ?? TYPE_LABELS[integration.integrationType] ?? integration.integrationType}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{integration.name}</p>
        <p className="text-xs text-[var(--color-text-muted)] truncate">{integration.maskedWebhookUrl}</p>
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <IntegrationHealthBadge
          status={integration.lastDeliveryStatus}
          consecutiveFailures={integration.consecutiveFailures}
        />
        {integration.lastDeliveryAt != null && (
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {new Date(integration.lastDeliveryAt * 1000).toLocaleString(lng)}
          </span>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={() => onFetchDeliveryLogs(integration.integrationId)} disabled={busy}>
        {t('integrations.history', 'History')}
      </Button>
      <button
        type="button"
        onClick={handleToggle}
        disabled={busy}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
          integration.enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
        } disabled:opacity-50`}
        title={integration.enabled ? t('integrations.disableIntegration', 'Disable Integration') : t('integrations.enableIntegration', 'Enable Integration')}
      >
        <span
          className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ${
            integration.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <Button size="sm" variant="ghost" onClick={handleTest} disabled={busy}>
        {t('common.test', 'Test')}
      </Button>
      <Button size="sm" variant="ghost" onClick={handleDelete} disabled={busy} className="text-[var(--color-error)]">
        {t('common.delete', 'Delete')}
      </Button>
    </div>
  );
}

function AddIntegrationForm({ applicationId, onCancel }: { applicationId: string; onCancel: () => void }) {
  const { t } = useTranslation();
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

  const webhookUrlPlaceholders: Record<OutboundIntegrationType, string> = {
    slack: t('integrations.slackWebhookUrl', 'Slack Webhook URL'),
    discord: t('integrations.discordWebhookUrl', 'Discord Webhook URL'),
    webhook: t('integrations.endpointUrl', 'Endpoint URL'),
  };
  const webhookUrlPlaceholder = webhookUrlPlaceholders[integrationType];

  return (
    <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
      <div className="flex gap-2">
        <select
          value={integrationType}
          onChange={(e) => setIntegrationType(e.target.value as OutboundIntegrationType)}
          disabled={busy}
          className="text-sm rounded border border-[var(--color-border)] bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          <option value="slack">{t('integrations.typeSlack', 'Slack')}</option>
          <option value="discord">{t('integrations.typeDiscord', 'Discord')}</option>
          <option value="webhook">{t('integrations.typeWebhook', 'Webhook')}</option>
        </select>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('integrations.namePlaceholder', 'Integration Name')}
          disabled={busy}
          className="flex-1"
        />
      </div>
      <Input
        value={webhookUrl}
        onChange={(e) => setWebhookUrl(e.target.value)}
        placeholder={webhookUrlPlaceholder}
        disabled={busy}
        type="url"
      />
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={busy || !name.trim() || !webhookUrl.trim()}>
          {t('integrations.saveIntegration', 'Save Integration')}
        </Button>
      </div>
    </div>
  );
}

export function IntegrationsSection({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation();
  const { integrationsByApplicationId, loadingIntegrations, onLoadIntegrations } = useMailboxCallbacks();
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    onLoadIntegrations(applicationId).catch(() => {});
  }, [applicationId]);

  const integrations: OutboundIntegration[] = integrationsByApplicationId[applicationId] ?? [];
  const atLimit = integrations.length >= 5;

  return (
    <CollapsibleSection title={t('integrations.outboundTitle', 'Outbound Integrations')}>
      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        {t('integrations.description', 'Forward email summaries to Slack, Discord, or a custom webhook.')}
      </p>
      <div className="px-4 pb-4">
        {loadingIntegrations && integrations.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('common.loading', 'Loading…')}</p>
        ) : integrations.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t('integrations.empty', 'No Integrations Configured.')}</p>
        ) : (
          <div>
            {integrations.map((integration) => (
              <IntegrationRow key={integration.integrationId} integration={integration} />
            ))}
          </div>
        )}
        {!showAddForm && !atLimit && (
          <Button size="sm" variant="ghost" onClick={() => setShowAddForm(true)} className="mt-3">
            + {t('integrations.add', 'Add Integration')}
          </Button>
        )}
        {atLimit && !showAddForm && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2">{t('integrations.maxReached', 'Maximum of 5 integrations reached.')}</p>
        )}
        {showAddForm && (
          <AddIntegrationForm applicationId={applicationId} onCancel={() => setShowAddForm(false)} />
        )}
      </div>
    </CollapsibleSection>
  );
}
