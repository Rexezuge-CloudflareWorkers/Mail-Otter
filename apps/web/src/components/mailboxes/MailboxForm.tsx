import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProviderId } from '../../../components/types';
import { OAUTH2_FEATURES, OAUTH2_FEATURE_SCOPES } from '../../../components/constants';
import type { OAuth2Feature } from '../../../components/constants';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

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
  isExpanded,
  onToggleExpand,
}: {
  form: ApplicationFormState;
  setForm: (form: ApplicationFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const prevApplicationId = useRef<string | undefined>(form.applicationId);

  useEffect(() => {
    if (form.applicationId && form.applicationId !== prevApplicationId.current) {
      setIsHighlighted(true);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const t = window.setTimeout(() => setIsHighlighted(false), 1500);
      return () => window.clearTimeout(t);
    }
    prevApplicationId.current = form.applicationId;
  }, [form.applicationId]);

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
    <div
      ref={formRef}
      className={cn(
        'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden',
        isHighlighted && 'animate-highlight-pulse',
      )}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[var(--color-surface-2)] transition-colors duration-150"
      >
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
          {form.applicationId ? 'Edit Mailbox' : 'New Mailbox'}
        </h2>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200',
            isExpanded && 'rotate-180',
          )}
        />
      </button>
      {isExpanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-[var(--color-border)] pt-4 animate-fade-in">
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
      )}
    </div>
  );
}
