import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectedApplication } from '../../types';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { Button } from '../ui/Button';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

const ALL_SECTIONS: Array<{ key: string }> = [
  { key: 'calendar' },
  { key: 'tasks' },
  { key: 'packages' },
  { key: 'flights' },
  { key: 'bills' },
  { key: 'appointments' },
];

export function DigestSection({ application }: { application: ConnectedApplication }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const { busy, onSaveDigestConfig, onSendDigestNow } = useMailboxCallbacks();
  const cfg = application.digestConfig;

  const [enabled, setEnabled] = useState<boolean>(cfg?.enabled ?? false);
  const [sendTime, setSendTime] = useState<string>(cfg?.sendTime ?? '08:00');
  const [sections, setSections] = useState<string[]>(cfg?.sections ?? ALL_SECTIONS.map((s) => s.key));
  const [dirty, setDirty] = useState(false);

  const toggleSection = (key: string) => {
    setSections((prev) => (prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]));
    setDirty(true);
  };

  const handleEnabledChange = (v: boolean) => {
    setEnabled(v);
    setDirty(true);
  };

  const handleTimeChange = (v: string) => {
    setSendTime(v);
    setDirty(true);
  };

  const save = async () => {
    await onSaveDigestConfig(application.applicationId, { enabled, sendTime, sections });
    setDirty(false);
  };

  const sectionLabels: Record<string, string> = {
    calendar: t('digest.sectionCalendar', "Calendar Events"),
    tasks: t('digest.sectionTasks', 'Pending Tasks'),
    packages: t('digest.sectionPackages', 'Package Deliveries'),
    flights: t('digest.sectionFlights', 'Upcoming Flights'),
    bills: t('digest.sectionBills', 'Bills Due Soon'),
    appointments: t('digest.sectionAppointments', 'Appointments'),
  };
  const sectionDescriptions: Record<string, string> = {
    calendar: t('digest.sectionCalendarDesc', "Today's events from your calendar."),
    tasks: t('digest.sectionTasksDesc', 'Outstanding to-do actions extracted from emails.'),
    packages: t('digest.sectionPackagesDesc', 'Active package tracking from processed emails.'),
    flights: t('digest.sectionFlightsDesc', 'Flight details extracted from booking emails.'),
    bills: t('digest.sectionBillsDesc', 'Bills due within 7 days found in emails.'),
    appointments: t('digest.sectionAppointmentsDesc', 'Confirmed or upcoming appointments within 48 hours.'),
  };

  const lastSentDate = cfg?.lastSentAt
    ? new Date(cfg.lastSentAt).toLocaleString(lng, { dateStyle: 'medium', timeStyle: 'short' })
    : t('common.never', 'Never');
  const lastSentLabel = t('digest.lastSentAt', 'Last Sent: {{date}}', { date: lastSentDate });

  return (
    <CollapsibleSection title={t('digest.title', 'Daily Digest')}>

      <p className="text-xs text-[var(--color-text-muted)] mb-4">
        {t('digest.description', 'Receive a daily digest email summarizing your pending tasks, calendar events, package deliveries, and more.')}
      </p>

      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="accent-[var(--color-accent)]"
            checked={enabled}
            disabled={busy}
            onChange={(e) => handleEnabledChange(e.target.checked)}
          />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{t('digest.enableDailyDigest', 'Enable Daily Digest')}</span>
        </label>

        {enabled && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm text-[var(--color-text-muted)] whitespace-nowrap">{t('digest.sendTime', 'Send Time')}</label>
              <input
                type="time"
                value={sendTime}
                disabled={busy}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="text-sm border border-[var(--color-border)] rounded px-2 py-1 bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
              <span className="text-xs text-[var(--color-text-muted)]">{t('digest.inTimeZone', 'in {{tz}}', { tz: application.timeZone || 'UTC' })}</span>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase">{t('digest.sections', 'Sections')}</p>
              <div className="space-y-2">
                {ALL_SECTIONS.map(({ key }) => (
                  <label
                    key={key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      sections.includes(key)
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)]'
                    } ${busy ? 'opacity-60 pointer-events-none' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0 accent-[var(--color-accent)]"
                      checked={sections.includes(key)}
                      disabled={busy}
                      onChange={() => toggleSection(key)}
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{sectionLabels[key] ?? key}</span>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{sectionDescriptions[key] ?? ''}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[var(--color-text-muted)]">{lastSentLabel}</span>
          <div className="flex items-center gap-2">
            {cfg && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => onSendDigestNow(application.applicationId)}
              >
                {t('digest.sendNowShort', 'Send Now')}
              </Button>
            )}
            {dirty && (
              <Button size="sm" disabled={busy} onClick={save}>
                {t('common.save', 'Save')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
