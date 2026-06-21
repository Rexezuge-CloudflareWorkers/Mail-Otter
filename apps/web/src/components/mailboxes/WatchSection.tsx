import type { ConnectedApplication } from '../../../components/types';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardTitle } from '../ui/Card';

export function WatchSection({
  application,
  availableFolders,
  loadingFolders,
  busy,
  onLoadFolders,
  onUpdateWatchedFolders,
}: {
  application: ConnectedApplication;
  availableFolders: Array<{ id: string; name: string }> | null;
  loadingFolders: boolean;
  busy: boolean;
  onLoadFolders: () => void;
  onUpdateWatchedFolders: (folderIds: string[] | null) => void;
}) {
  const isOutlook = application.providerId === 'microsoft-outlook';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Watch Folders</CardTitle>
        <Button
          variant="secondary"
          size="sm"
          onClick={onLoadFolders}
          loading={loadingFolders}
          disabled={busy || loadingFolders || application.status !== 'connected'}
        >
          Load Folders
        </Button>
      </CardHeader>

      {availableFolders ? (
        availableFolders.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">No Folders Found.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {availableFolders.map((folder) => {
              const checked = application.watchedFolders?.some((wf) => wf.id === folder.id) ?? false;
              return (
                <label key={folder.id} className="inline-flex items-center gap-3 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                  <input
                    type={isOutlook ? 'radio' : 'checkbox'}
                    name={isOutlook ? `watch-folder-${application.applicationId}` : undefined}
                    checked={checked}
                    onChange={() => {
                      const currentIds = (application.watchedFolders || []).map((wf) => wf.id);
                      const next = isOutlook
                        ? checked ? [] : [folder.id]
                        : checked
                          ? currentIds.filter((id) => id !== folder.id)
                          : [...currentIds, folder.id];
                      onUpdateWatchedFolders(next.length > 0 ? next : null);
                    }}
                    disabled={busy}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  {folder.name}
                </label>
              );
            })}
          </div>
        )
      ) : application.watchedFolders && application.watchedFolders.length > 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Watching: {application.watchedFolders.map((wf) => wf.name).join(', ')} — Click &quot;Load Folders&quot; To Change.
        </p>
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Watching Default Folder (Inbox). Click &quot;Load Folders&quot; To Customize.
        </p>
      )}
    </Card>
  );
}
