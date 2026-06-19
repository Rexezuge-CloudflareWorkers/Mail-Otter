import type { ProviderId } from '../../../components/types';
import { Input, Select } from '../ui/Input';
import { Button } from '../ui/Button';

export interface ApplicationFormState {
  applicationId?: string;
  displayName: string;
  providerId: ProviderId;
  clientId: string;
  clientSecret: string;
  gmailPubsubTopicName: string;
}

export const emptyForm: ApplicationFormState = {
  displayName: '',
  providerId: 'google-gmail',
  clientId: '',
  clientSecret: '',
  gmailPubsubTopicName: '',
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
          onChange={(e) => update({ providerId: e.target.value as ProviderId })}
          disabled={Boolean(form.applicationId)}
          className="w-full"
        >
          <option value="google-gmail">Google Gmail / OAuth2</option>
          <option value="microsoft-outlook">Microsoft Outlook / OAuth2</option>
        </Select>
        <Input
          value={form.clientId}
          onChange={(e) => update({ clientId: e.target.value })}
          placeholder="OAuth2 client ID"
        />
        <Input
          value={form.clientSecret}
          onChange={(e) => update({ clientSecret: e.target.value })}
          placeholder="OAuth2 client secret"
          type="password"
        />
        {form.providerId === 'google-gmail' && (
          <Input
            value={form.gmailPubsubTopicName}
            onChange={(e) => update({ gmailPubsubTopicName: e.target.value })}
            placeholder="projects/{projectId}/topics/{topicName}"
          />
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
