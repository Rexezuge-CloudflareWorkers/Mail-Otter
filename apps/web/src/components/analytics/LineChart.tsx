interface LineChartPoint {
  date: string;
  value: number;
}

export function LineChart({ points, label }: { points: LineChartPoint[]; label: string }) {
  if (points.length === 0) {
    return <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">No Data.</div>;
  }

  const W = 600;
  const H = 160;
  const PADX = 40;
  const PADY = 20;
  const plotW = W - PADX * 2;
  const plotH = H - PADY * 2;
  const maxVal = Math.max(...points.map((p) => p.value), 1);

  const toX = (i: number): number => PADX + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const toY = (v: number): number => PADY + plotH - (v / maxVal) * plotH;

  const polyPoints = points.map((p, i) => `${toX(i)},${toY(p.value)}`).join(' ');
  const areaPoints = `${toX(0)},${H - PADY} ${polyPoints} ${toX(points.length - 1)},${H - PADY}`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label={label} preserveAspectRatio="xMidYMid meet">
        <polygon points={areaPoints} fill="var(--color-accent)" fillOpacity="0.15" />
        <polyline points={polyPoints} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
        {points.map((p, i) => (
          <circle key={p.date} cx={toX(i)} cy={toY(p.value)} r="3" fill="var(--color-accent)">
            <title>{`${p.date}: ${p.value.toLocaleString()}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
