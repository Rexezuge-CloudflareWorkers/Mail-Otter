import type { EmailAction } from './EmailAction';

const TERMINAL_ACTION_STATUSES = new Set(['succeeded', 'failed', 'expired', 'cancelled']);

function isActionTerminal(action: Pick<EmailAction, 'status'>): boolean {
  return TERMINAL_ACTION_STATUSES.has(action.status);
}

function isActionExecutable(action: Pick<EmailAction, 'status' | 'expiresAt'>, nowSeconds: number): boolean {
  if (action.status !== 'pending') return false;
  return action.expiresAt > nowSeconds;
}

function isActionSnoozed(action: Pick<EmailAction, 'snoozedUntil'>, nowSeconds: number): boolean {
  return (action.snoozedUntil ?? 0) > nowSeconds;
}

export { isActionExecutable, isActionSnoozed, isActionTerminal, TERMINAL_ACTION_STATUSES };
