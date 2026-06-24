import { useState, useEffect } from 'react';
import type { ConnectedApplication } from '../../../components/types';
import { Button } from '../ui/Button';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { useMailboxCallbacks } from '../../contexts/MailboxCallbacksContext';

const setsEqual = (a: string[] | null, b: string[] | null) => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.length === b.length && a.every((id) => b.includes(id));
};

export function WatchSection({
  application,
  availableFolders,
  loadingFolders,
}: {
  application: ConnectedApplication;
  availableFolders: Array<{ id: string; name: string }> | null;
  loadingFolders: boolean;
}) {
  const { busy, onLoadFolders, onUpdateWatchedFolders } = useMailboxCallbacks();
  const isOutlook = application.providerId === 'microsoft-outlook';
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (availableFolders !== null) {
      setPendingIds(application.watchedFolders?.map((wf) => wf.id) ?? null);
    } else {
      setPendingIds(null);
    }
  }, [availableFolders, application.applicationId]);

  const originalIds = application.watchedFolders?.map((wf) => wf.id) ?? null;
  const isUnchanged = setsEqual(pendingIds, originalIds);

  return (
    <CollapsibleSection title="Watch Folders">
      <div className="mb-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onLoadFolders(application.applicationId)}
          loading={loadingFolders}
          disabled={busy || loadingFolders || application.status !== 'connected'}
        >
          Load Folders
        </Button>
      </div>

      {availableFolders ? (
        availableFolders.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">No Folders Found.</p>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {availableFolders.map((folder) => {
                const effectiveIds = pendingIds ?? application.watchedFolders?.map((wf) => wf.id) ?? [];
                const checked = effectiveIds.includes(folder.id);
                return (
                  <label key={folder.id} className="inline-flex items-center gap-3 text-sm text-[var(--color-text-secondary)] cursor-pointer">
                    <input
                      type={isOutlook ? 'radio' : 'checkbox'}
                      name={isOutlook ? `watch-folder-${application.applicationId}` : undefined}
                      checked={checked}
                      onChange={() => {
                        if (isOutlook) {
                          const next = checked ? [] : [folder.id];
                          setPendingIds(next.length > 0 ? next : null);
                        } else {
                          const currentIds = pendingIds ?? [];
                          const next = checked
                            ? currentIds.filter((id) => id !== folder.id)
                            : [...currentIds, folder.id];
                          setPendingIds(next.length > 0 ? next : null);
                        }
                      }}
                      disabled={busy}
                      className="h-4 w-4 accent-[var(--color-accent)]"
                    />
                    {folder.name}
                  </label>
                );
              })}
            </div>
            <div className="mt-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => onUpdateWatchedFolders(application.applicationId, pendingIds)}
                disabled={busy || isUnchanged}
              >
                Save Folders
              </Button>
            </div>
          </>
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
    </CollapsibleSection>
  );
}
