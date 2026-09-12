import {
  EMAIL_ACTION_STATUS_SUCCEEDED,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TRIGGER_SCHEDULED,
} from '@mail-otter/shared/constants';
import { BadRequestError, NotFoundError } from '@mail-otter/backend-errors';
import { TimestampUtil } from '@mail-otter/shared/utils';
import type { EmailAction } from '@mail-otter/shared/model';
import { createActionDAO } from './ActionServiceUtils';
import { executeAction } from './ActionExecutionService';
import type { ActionExecutionEnv } from './ActionExecutionService';

const MAX_SNOOZE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SNOOZE_EXPIRY_BUFFER_SECONDS = 24 * 60 * 60; // 24h buffer past snoozedUntil
const SCHEDULE_EXPIRY_BUFFER_SECONDS = 60 * 60; // 1h buffer past scheduledFor

const AUTO_EXECUTABLE_ACTION_TYPES: ReadonlySet<string> = new Set([
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
]);

async function snoozeAction(env: ActionExecutionEnv, actionId: string, userEmail: string, snoozedUntil: Date | null): Promise<EmailAction> {
  const dao = await createActionDAO(env);
  const action = await dao.getForUser(actionId, userEmail);
  if (!action) throw new NotFoundError('Email action was not found.');
  if (action.status !== 'pending') throw new BadRequestError('Only pending actions can be snoozed.');

  if (snoozedUntil === null) {
    await dao.cancelSnooze(actionId);
  } else {
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const snoozedUntilTs = Math.floor(snoozedUntil.getTime() / 1000);
    if (snoozedUntilTs <= now) throw new BadRequestError('Snooze time must be in the future.');
    if (snoozedUntilTs - now > MAX_SNOOZE_SECONDS) throw new BadRequestError('Snooze time cannot exceed 30 days.');
    const newExpiresAt = snoozedUntilTs + SNOOZE_EXPIRY_BUFFER_SECONDS;
    await dao.snoozeAction(actionId, snoozedUntilTs, newExpiresAt);
  }

  return (await dao.getForUser(actionId, userEmail)) ?? action;
}

async function scheduleAction(env: ActionExecutionEnv, actionId: string, userEmail: string, scheduledFor: Date | null): Promise<EmailAction> {
  const dao = await createActionDAO(env);
  const action = await dao.getForUser(actionId, userEmail);
  if (!action) throw new NotFoundError('Email action was not found.');
  if (action.status !== 'pending') throw new BadRequestError('Only pending actions can be scheduled.');

  if (scheduledFor === null) {
    await dao.cancelSchedule(actionId);
  } else {
    if (!AUTO_EXECUTABLE_ACTION_TYPES.has(action.actionType)) {
      throw new BadRequestError('This action type does not support scheduled auto-execution.');
    }
    const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
    const scheduledForTs = Math.floor(scheduledFor.getTime() / 1000);
    if (scheduledForTs <= now) throw new BadRequestError('Scheduled time must be in the future.');
    if (scheduledForTs - now > MAX_SNOOZE_SECONDS) throw new BadRequestError('Scheduled time cannot exceed 30 days.');
    const newExpiresAt = scheduledForTs + SCHEDULE_EXPIRY_BUFFER_SECONDS;
    await dao.scheduleAction(actionId, scheduledForTs, newExpiresAt);
  }

  return (await dao.getForUser(actionId, userEmail)) ?? action;
}

interface ScheduledExecutionResult {
  attempted: number;
  succeeded: number;
  failed: number;
}

async function executeScheduledActions(env: ActionExecutionEnv): Promise<ScheduledExecutionResult> {
  const dao = await createActionDAO(env);
  const now = TimestampUtil.getCurrentUnixTimestampInSeconds();
  const actions = await dao.listPendingScheduledActions(now, 50);

  let succeeded = 0;
  let failed = 0;

  for (const action of actions) {
    try {
      const result = await executeAction(action, EMAIL_ACTION_TRIGGER_SCHEDULED, null, env);
      if (result.status === EMAIL_ACTION_STATUS_SUCCEEDED) {
        succeeded++;
      } else {
        failed++;
      }
    } catch (error: unknown) {
      failed++;
      console.warn(`[ActionSchedulingService] Scheduled execution failed for action ${action.actionId}:`, error);
    }
  }

  return { attempted: actions.length, succeeded, failed };
}

export type {  ScheduledExecutionResult };
export { snoozeAction, scheduleAction, executeScheduledActions };

export {type ActionExecutionEnv as ActionSchedulingEnv} from './ActionExecutionService';