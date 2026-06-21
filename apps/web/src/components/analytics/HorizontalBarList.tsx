interface HorizontalBarItem {
  label: string;
  value: number;
}

export function HorizontalBarList({ items }: { items: HorizontalBarItem[] }) {
  if (items.length === 0) {
    return <div className="py-4 text-sm text-[var(--color-text-muted)]">No Data.</div>;
  }

  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-32 truncate text-xs text-[var(--color-text-secondary)]">{item.label}</span>
          <div className="flex-1 h-2 rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs text-[var(--color-text-muted)]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
