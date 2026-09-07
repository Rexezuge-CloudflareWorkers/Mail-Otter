import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';

export function LoadMoreButton({
  onLoadMore,
  loading,
  label,
  className,
}: {
  onLoadMore: () => void;
  loading?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-center py-3">
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading} className={className}>
        <ChevronDown className="h-3.5 w-3.5" />
        {label ?? t('common.loadMore', 'Load More')}
      </Button>
    </div>
  );
}
