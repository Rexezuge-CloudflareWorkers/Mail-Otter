import type { ConnectedApplication } from '../../types';
import { Select } from '../ui/Input';

export function MailboxSelect({
  value,
  onChange,
  applications,
  className = 'min-w-[180px]',
}: {
  value: string;
  onChange: (id: string) => void;
  applications: ConnectedApplication[];
  className?: string;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">All Mailboxes</option>
      {applications.map((a) => (
        <option key={a.applicationId} value={a.applicationId}>
          {a.displayName}
        </option>
      ))}
    </Select>
  );
}
