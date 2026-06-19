export function NoticeBar({ notice }: { notice: { type: 'success' | 'error'; text: string } }) {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-down px-5 py-3 rounded-xl shadow-xl bg-[var(--color-surface-2)] border border-[var(--color-border-muted)] max-w-[calc(100vw-2rem)]">
      <span className={notice.type === 'success' ? 'text-[var(--color-success-text)]' : 'text-[var(--color-error-text)]'}>
        {notice.text}
      </span>
    </div>
  );
}
