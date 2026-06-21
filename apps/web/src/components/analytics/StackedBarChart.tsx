interface StackedBarDay {
  date: string;
  summarized: number;
  skipped: number;
  error: number;
}

export function StackedBarChart({ days }: { days: StackedBarDay[] }) {
  if (days.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">No Data.</div>;
  }

  const maxTotal = Math.max(...days.map((d) => d.summarized + d.skipped + d.error), 1);

  return (
    <div className="flex items-end gap-0.5 h-32 overflow-x-auto">
      {days.map((d) => {
        const total = d.summarized + d.skipped + d.error;
        const heightPct = (total / maxTotal) * 100;
        return (
          <div
            key={d.date}
            className="flex flex-col-reverse flex-1 min-w-[6px] rounded-t-sm overflow-hidden"
            style={{ height: `${heightPct}%` }}
            title={`${d.date}: ${total} total`}
          >
            {d.summarized > 0 && <div className="bg-[var(--color-accent)]" style={{ flex: d.summarized }} />}
            {d.skipped > 0 && <div className="bg-[var(--color-text-muted)] opacity-50" style={{ flex: d.skipped }} />}
            {d.error > 0 && <div className="bg-red-500" style={{ flex: d.error }} />}
          </div>
        );
      })}
    </div>
  );
}
