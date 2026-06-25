import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ProviderId } from '../../../components/types';
import { OAUTH2_FEATURES, OAUTH2_FEATURE_SCOPES } from '../../../components/constants';
import type { OAuth2Feature } from '../../../components/constants';
import { providerLabels, providerConnectionMethods, methodLabels } from '../../../components/utils';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { FORM_HIGHLIGHT_TIMEOUT_MS } from '../../lib/constants';

export interface ApplicationFormState {
  applicationId?: string;
  displayName: string;
  providerId: ProviderId;
  connectionMethod: 'oauth2' | 'imap-password';
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName: string;
  imapHost: string;
  imapPort: string;
  imapUsername: string;
  imapPassword: string;
  smtpHost: string;
  smtpPort: string;
  enabledFeatures: string[];
  timeZone: string;
}

function getBrowserTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getDefaultFeatures(providerId: ProviderId): string[] {
  return (Object.entries(OAUTH2_FEATURES))
    .filter(([featureId]) => (OAUTH2_FEATURE_SCOPES[featureId]?.[providerId] ?? []).length > 0)
    .map(([featureId]) => featureId);
}

function getDefaultConnectionMethod(providerId: ProviderId): 'oauth2' | 'imap-password' {
  const methods = providerConnectionMethods[providerId];
  return methods?.[0] ?? 'oauth2';
}

const IMAP_PROVIDERS = new Set(['yahoo-mail', 'custom-imap', 'apple-icloud']);

export const emptyForm: ApplicationFormState = {
  displayName: '',
  providerId: 'google-gmail',
  connectionMethod: 'oauth2',
  clientId: '',
  clientSecret: '',
  gmailPubsubTopicName: '',
  imapHost: '',
  imapPort: '993',
  imapUsername: '',
  imapPassword: '',
  smtpHost: '',
  smtpPort: '587',
  enabledFeatures: getDefaultFeatures('google-gmail'),
  timeZone: getBrowserTimeZone(),
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
      const t = setTimeout(() => setIsHighlighted(false), FORM_HIGHLIGHT_TIMEOUT_MS);
      return () => clearTimeout(t);
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

  const availableMethods = providerConnectionMethods[form.providerId] ?? ['oauth2'];
  const isImapProvider = IMAP_PROVIDERS.has(form.providerId);
  const isImapPasswordMethod = form.connectionMethod === 'imap-password';
  const isOAuth2Method = form.connectionMethod === 'oauth2';
  const showImapFields = isImapProvider || isImapPasswordMethod;
  const showOAuth2Fields = isOAuth2Method && !isImapProvider;
  const isFixedHostImapProvider = isImapPasswordMethod && !isImapProvider;

  const providerFeatures: [string, OAuth2Feature][] = (Object.entries(OAUTH2_FEATURES)).filter(
    ([featureId]) => (OAUTH2_FEATURE_SCOPES[featureId]?.[form.providerId] ?? []).length > 0,
  );

  const timeZones: string[] = useMemo(() => {
    const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    const supported: string[] = typeof supportedValuesOf === 'function' ? supportedValuesOf('timeZone') : ['UTC'];
    return supported.includes(form.timeZone) ? supported : [form.timeZone, ...supported];
  }, [form.timeZone]);

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
            placeholder="Display Name"
          />

          {/* Provider selector */}
          <Select
            value={form.providerId}
            onChange={(e) => {
              const p = e.target.value as ProviderId;
              const defaultMethod = getDefaultConnectionMethod(p);
              update({
                providerId: p,
                connectionMethod: defaultMethod,
                enabledFeatures: getDefaultFeatures(p),
              });
            }}
            disabled={Boolean(form.applicationId)}
            className="w-full"
          >
            {(Object.keys(providerLabels) as ProviderId[]).map((pid) => (
              <option key={pid} value={pid}>
                {providerLabels[pid]}
              </option>
            ))}
          </Select>

          {/* Connection method selector — only shown when provider supports multiple methods */}
          {availableMethods.length > 1 && (
            <Select
              value={form.connectionMethod}
              onChange={(e) => update({ connectionMethod: e.target.value as 'oauth2' | 'imap-password' })}
              disabled={Boolean(form.applicationId)}
              className="w-full"
            >
              {availableMethods.map((method) => (
                <option key={method} value={method}>
                  {methodLabels[method] ?? method}
                </option>
              ))}
            </Select>
          )}

          {/* OAuth2 credential fields — only for OAuth2 non-IMAP providers */}
          {isOAuth2Method && !isImapPasswordMethod && (
            <>
              <Input
                value={form.clientId}
                onChange={(e) => update({ clientId: e.target.value })}
                placeholder={form.applicationId ? '(Unchanged)' : 'OAuth2 Client ID'}
              />
              <Input
                value={form.clientSecret}
                onChange={(e) => update({ clientSecret: e.target.value })}
                placeholder={form.applicationId ? '(Unchanged)' : 'OAuth2 Client Secret'}
                type="password"
              />
            </>
          )}

          {/* Yahoo OAuth2: also show IMAP username (must match mailbox address) */}
          {form.providerId === 'yahoo-mail' && isOAuth2Method && (
            <Input
              value={form.imapUsername}
              onChange={(e) => update({ imapUsername: e.target.value })}
              placeholder="Yahoo Email Address (for IMAP)"
            />
          )}

          {/* Gmail Pub/Sub topic — only for OAuth2 connections */}
          {form.providerId === 'google-gmail' && isOAuth2Method && (
            <Input
              value={form.gmailPubsubTopicName}
              onChange={(e) => update({ gmailPubsubTopicName: e.target.value })}
              placeholder="projects/{projectId}/topics/{topicName}"
            />
          )}

          {/* IMAP fields */}
          {showImapFields && form.providerId !== 'yahoo-mail' && (
            <div className="space-y-2">
              {/* Host/port — only for custom-imap (user-provided server) */}
              {form.providerId === 'custom-imap' && (
                <div className="flex gap-2">
                  <Input
                    value={form.imapHost}
                    onChange={(e) => update({ imapHost: e.target.value })}
                    placeholder="IMAP Host"
                    className="flex-1"
                  />
                  <Input
                    value={form.imapPort}
                    onChange={(e) => update({ imapPort: e.target.value })}
                    placeholder="993"
                    className="w-24"
                    type="number"
                  />
                </div>
              )}
              <Input
                value={form.imapUsername}
                onChange={(e) => update({ imapUsername: e.target.value })}
                placeholder={isFixedHostImapProvider ? 'Email Address' : 'IMAP Username'}
              />
              {isImapPasswordMethod && (
                <Input
                  value={form.imapPassword}
                  onChange={(e) => update({ imapPassword: e.target.value })}
                  placeholder={
                    form.applicationId
                      ? '(Unchanged)'
                      : isFixedHostImapProvider || form.providerId === 'apple-icloud'
                        ? 'App Password'
                        : 'IMAP Password'
                  }
                  type="password"
                />
              )}
              {isOAuth2Method && form.providerId === 'custom-imap' && (
                <>
                  <Input
                    value={form.clientId}
                    onChange={(e) => update({ clientId: e.target.value })}
                    placeholder={form.applicationId ? '(Unchanged)' : 'OAuth2 Client ID'}
                  />
                  <Input
                    value={form.clientSecret}
                    onChange={(e) => update({ clientSecret: e.target.value })}
                    placeholder={form.applicationId ? '(Unchanged)' : 'OAuth2 Client Secret'}
                    type="password"
                  />
                </>
              )}
              {form.providerId === 'custom-imap' && (
                <div className="flex gap-2">
                  <Input
                    value={form.smtpHost}
                    onChange={(e) => update({ smtpHost: e.target.value })}
                    placeholder="SMTP Host"
                    className="flex-1"
                  />
                  <Input
                    value={form.smtpPort}
                    onChange={(e) => update({ smtpPort: e.target.value })}
                    placeholder="587"
                    className="w-24"
                    type="number"
                  />
                </div>
              )}
            </div>
          )}

          {/* Optional features for OAuth2 providers */}
          {providerFeatures.length > 0 && showOAuth2Fields && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">Optional Features{form.applicationId ? ' (Requires Re-Authorization)' : ''}</p>
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

          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">Time Zone</p>
            <Select value={form.timeZone} onChange={(e) => update({ timeZone: e.target.value })} className="w-full">
              {timeZones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="primary" className="flex-1" onClick={onSave} loading={busy}>
              {form.applicationId ? 'Save Changes' : 'Create Mailbox'}
            </Button>
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
