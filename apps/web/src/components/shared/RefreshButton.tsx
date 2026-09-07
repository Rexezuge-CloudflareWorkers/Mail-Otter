import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';

export function RefreshButton({
  onRefresh,
  loading,
  className,
}: {
  onRefresh: () => void;
  loading?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading} className={className}>
      <RefreshCw className="h-3.5 w-3.5" />
      {t('common.refresh', 'Refresh')}
    </Button>
  );
}
