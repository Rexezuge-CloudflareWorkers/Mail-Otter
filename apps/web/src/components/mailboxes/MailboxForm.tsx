import type { ProviderId } from '../../../components/types';
import { OAUTH2_FEATURES, OAUTH2_FEATURE_SCOPES } from '../../../components/constants';
import type { OAuth2Feature } from '../../../components/constants';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';

export interface ApplicationFormState {
  applicationId?: string;
  displayName: string;
  providerId: ProviderId;
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName: string;
  enabledFeatures: string[];
}

export const emptyForm: ApplicationFormState = {
  displayName: '',
  providerId: 'google-gmail',
  clientId: '',
  clientSecret: '',
  gmailPubsubTopicName: '',
  enabledFeatures: [],
};

export function MailboxForm({
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

  const toggleFeature = (featureId: string, checked: boolean) => {
    const next = checked
      ? [...form.enabledFeatures, featureId]
      : form.enabledFeatures.filter((f) => f !== featureId);
    update({ enabledFeatures: next });
  };

  const providerFeatures: [string, OAuth2Feature][] = (Object.entries(OAUTH2_FEATURES) as [string, OAuth2Feature][]).filter(
    ([featureId]) => (OAUTH2_FEATURE_SCOPES[featureId]?.[form.providerId] ?? []).length > 0,
  );

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-5">
      <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-4">
        {form.applicationId ? 'Edit Mailbox' : 'New Mailbox'}
      </h2>
      <div className="space-y-3">
        <Input
          value={form.displayName}
          onChange={(e) => update({ displayName: e.target.value })}
          placeholder="Display name"
        />
        <Select
          value={form.providerId}
          onChange={(e) => update({ providerId: e.target.value as ProviderId, enabledFeatures: [] })}
          disabled={Boolean(form.applicationId)}
          className="w-full"
        >
          <option value="google-gmail">Google Gmail / OAuth2</option>
          <option value="microsoft-outlook">Microsoft Outlook / OAuth2</option>
        </Select>
        <Input
          value={form.clientId}
          onChange={(e) => update({ clientId: e.target.value })}
          placeholder={form.applicationId ? '(unchanged)' : 'OAuth2 client ID'}
        />
        <Input
          value={form.clientSecret}
          onChange={(e) => update({ clientSecret: e.target.value })}
          placeholder={form.applicationId ? '(unchanged)' : 'OAuth2 client secret'}
          type="password"
        />
        {form.providerId === 'google-gmail' && (
          <Input
            value={form.gmailPubsubTopicName}
            onChange={(e) => update({ gmailPubsubTopicName: e.target.value })}
            placeholder="projects/{projectId}/topics/{topicName}"
          />
        )}
        {providerFeatures.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">Optional features (requires re-authorization)</p>
            {providerFeatures.map(([featureId, feature]) => (
              <label key={featureId} className="inline-flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabledFeatures.includes(featureId)}
                  onChange={(e) => toggleFeature(featureId, e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-accent)] rounded"
                />
                {feature.label}
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="primary" className="flex-1" onClick={onSave} loading={busy}>
            {form.applicationId ? 'Save Changes' : 'Create Mailbox'}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
