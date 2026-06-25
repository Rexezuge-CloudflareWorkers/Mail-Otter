import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Label } from '../ui/Input';
import { cn } from '../../lib/utils';
import { COPY_FEEDBACK_TIMEOUT_MS } from '../../lib/constants';

export function ReadOnlyField({ label, value, showCopy = false }: { label: string; value: string; showCopy?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_TIMEOUT_MS);
  };

  return (
    <div>
      <Label className="mb-1.5">{label}</Label>
      <div className="flex">
        <input
          readOnly
          value={value}
          className={cn(
            'min-w-0 px-3 py-2 bg-[var(--color-surface-base)] border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm flex-1',
            showCopy ? 'rounded-l-lg border-r-0' : 'rounded-lg',
          )}
        />
        {showCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="px-3 py-2 rounded-r-lg bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors duration-150"
            title="Copy To Clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success-text)]" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
