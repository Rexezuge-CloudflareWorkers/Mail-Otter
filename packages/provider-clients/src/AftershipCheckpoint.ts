/**
 * Aftership tracking checkpoint ordering.
 *
 * Aftership returns `checkings[].checkpoints` newest-first. Two call sites
 * disagreed on which end was "latest": `ActionStatusSyncUtil` took
 * `checkpoints[0]` while `PackageTrackingService.buildSummary` took
 * `checkpoints.at(-1)`, which is the *oldest* scan. A package scanned five
 * times therefore showed its current location ("Louisville, KY — Out For
 * Delivery") in the digest while the action card reported the location from its
 * first-ever scan. Single-checkpoint fixtures hid the divergence entirely.
 *
 * Centralised here so the two surfaces cannot disagree again.
 */
interface AftershipCheckpoint {
  city?: string;
  state?: string;
  message?: string;
  checkpoint_time?: string;
}

const latestCheckpoint = (checkpoints: AftershipCheckpoint[] | undefined): AftershipCheckpoint | undefined => checkpoints?.[0];

const checkpointPlace = (checkpoint: AftershipCheckpoint | undefined): string | undefined => {
  if (!checkpoint) return undefined;
  const place = [checkpoint.city, checkpoint.state].filter(Boolean).join(', ');
  return place || undefined;
};

export { checkpointPlace, latestCheckpoint };
export type { AftershipCheckpoint };
