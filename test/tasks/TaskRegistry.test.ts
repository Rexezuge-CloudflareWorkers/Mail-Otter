import { describe, expect, it } from 'vitest';
import { CRON_TASK_DEFINITIONS, tasksForPhase } from '../../apps/background/src/scheduled/TaskRegistry';

describe('TaskRegistry', () => {
  it('contains all 20 cron tasks across two phases', () => {
    expect(CRON_TASK_DEFINITIONS).toHaveLength(20);
    expect(tasksForPhase(1)).toHaveLength(8);
    expect(tasksForPhase(2)).toHaveLength(12);
  });

  it('keeps drive sync tasks in phase 1 and digests in phase 2', () => {
    const phase1Names = tasksForPhase(1).map((t) => t.constructor.name);
    const phase2Names = tasksForPhase(2).map((t) => t.constructor.name);
    expect(phase1Names).toContain('GoogleDriveSyncTask');
    expect(phase1Names).toContain('OneDriveSyncTask');
    expect(phase1Names).toContain('SubscriptionRenewalTask');
    expect(phase2Names).toContain('ScheduledDigestTask');
    expect(phase2Names).toContain('ProcessedMessagePruningTask');
  });

  it('creates fresh task instances per call', () => {
    const first = tasksForPhase(1);
    const second = tasksForPhase(1);
    expect(first[0]).not.toBe(second[0]);
  });
});
