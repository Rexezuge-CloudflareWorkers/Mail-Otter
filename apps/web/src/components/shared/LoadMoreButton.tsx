import { ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';

export function LoadMoreButton({
  onLoadMore,
  loading,
  label = 'Load More',
  className,
}: {
  onLoadMore: () => void;
  loading?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div className="flex justify-center py-3">
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loading} className={className}>
        <ChevronDown className="h-3.5 w-3.5" />
        {label}
      </Button>
    </div>
  );
}
