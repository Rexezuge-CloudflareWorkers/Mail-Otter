import { useTranslation } from 'react-i18next';
import { formatNumberLocale } from '../../lib/locale';

export function AiUsageBar({
  estimatedNeurons,
  dailyNeuronLimit,
  fallbackThreshold,
}: {
  estimatedNeurons: number;
  dailyNeuronLimit: number;
  fallbackThreshold: number;
}) {
  const ratio = dailyNeuronLimit > 0 ? estimatedNeurons / dailyNeuronLimit : 0;
  const pct = Math.round(ratio * 100);
  const barWidth = Math.min(ratio * 100, 100);
  const fallbackPct = dailyNeuronLimit > 0 ? (fallbackThreshold / dailyNeuronLimit) * 100 : 60;
  const isOver = ratio > 1;

  let barColor: string;
  if (isOver || pct >= 90) {
    barColor = '#ef4444';
  } else if (pct >= fallbackPct) {
    barColor = '#f59e0b';
  } else {
    barColor = '#22c55e';
  }

  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const label = isOver
    ? t('analytics.overLimit', '{{used}} / {{limit}} Neurons · Over Limit', {
        used: formatNumberLocale(estimatedNeurons, lng),
        limit: formatNumberLocale(dailyNeuronLimit, lng),
      })
    : t('analytics.neurons', '{{used}} / {{limit}} Neurons · {{pct}}%', {
        used: formatNumberLocale(estimatedNeurons, lng),
        limit: formatNumberLocale(dailyNeuronLimit, lng),
        pct,
      });

  return (
    <div>
      <div className="max-w-7xl mx-auto px-6 pb-1.5 flex items-center justify-end">
        <span className="text-xs" style={{ color: barColor }}>
          {label}
        </span>
      </div>
      <div className="h-0.5 w-full bg-[var(--color-surface-2)]">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${barWidth}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}
