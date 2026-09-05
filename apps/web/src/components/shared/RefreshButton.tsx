import { RefreshCw } from 'lucide-react';
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
  return (
    <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading} className={className}>
      <RefreshCw className="h-3.5 w-3.5" />
      Refresh
    </Button>
  );
}
