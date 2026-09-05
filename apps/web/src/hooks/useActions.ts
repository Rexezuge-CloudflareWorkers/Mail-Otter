import { useState } from 'react';
import type { EmailAction, EmailActionExecution, EmailActionStatus } from '../types';
import * as actionSvc from '../services/actionService';

interface UseActionsOptions {
  setIsBusy: (v: boolean) => void;
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useActions({ setIsBusy, showNotice }: UseActionsOptions) {
  const [actions, setActions] = useState<EmailAction[]>([]);
  const [actionsCursor, setActionsCursor] = useState<string | undefined>();
  const [actionApplicationId, setActionApplicationId] = useState('');
  const [actionStatus, setActionStatus] = useState<EmailActionStatus | ''>('');
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [actionExecutions, setActionExecutions] = useState<EmailActionExecution[]>([]);
  const [selectedActionId, setSelectedActionId] = useState('');

  const loadActions = async (append = false, cursor?: string) => {
    try {
      const data = await actionSvc.loadActions(actionApplicationId, actionStatus, cursor, showSnoozed);
      setActions((c) => (append ? [...c, ...data.actions] : data.actions));
      setActionsCursor(data.nextCursor);
      setSelectedActionId((c) => c || data.actions[0]?.actionId || '');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Actions.');
    }
  };

  const loadActionExecutions = async (actionId: string) => {
    setSelectedActionId(actionId);
    try {
      const data = await actionSvc.loadActionExecutions(actionId);
      setActionExecutions(data.executions);
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Load Action Audit.');
    }
  };

  const executeAction = async (actionId: string) => {
    setIsBusy(true);
    try {
      const data = await actionSvc.executeAction(actionId);
      setActions((c) => c.map((a) => (a.actionId === data.action.actionId ? data.action : a)));
      await loadActionExecutions(actionId);
      showNotice(
        data.action.status === 'succeeded' ? 'success' : 'error',
        data.action.result?.summary || data.action.errorMessage || data.action.status,
      );
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Execute Action.');
    } finally {
      setIsBusy(false);
    }
  };

  const snoozeAction = async (actionId: string, snoozedUntil: string | null) => {
    setIsBusy(true);
    try {
      const data = await actionSvc.snoozeAction(actionId, snoozedUntil);
      setActions((c) => c.map((a) => (a.actionId === data.action.actionId ? data.action : a)));
      showNotice('success', snoozedUntil ? 'Action Snoozed.' : 'Snooze Cancelled.');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Snooze Action.');
    } finally {
      setIsBusy(false);
    }
  };

  const scheduleAction = async (actionId: string, scheduledFor: string | null) => {
    setIsBusy(true);
    try {
      const data = await actionSvc.scheduleAction(actionId, scheduledFor);
      setActions((c) => c.map((a) => (a.actionId === data.action.actionId ? data.action : a)));
      showNotice('success', scheduledFor ? 'Action Scheduled.' : 'Schedule Cancelled.');
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : 'Unable To Schedule Action.');
    } finally {
      setIsBusy(false);
    }
  };

  return {
    actions,
    actionsCursor,
    actionApplicationId,
    setActionApplicationId,
    actionStatus,
    setActionStatus,
    showSnoozed,
    setShowSnoozed,
    actionExecutions,
    selectedActionId,
    setSelectedActionId,
    loadActions,
    loadActionExecutions,
    executeAction,
    snoozeAction,
    scheduleAction,
  };
}
