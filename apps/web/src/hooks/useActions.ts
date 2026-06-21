import { useState } from 'react';
import type { EmailAction, EmailActionExecution, EmailActionStatus } from '../../components/types';
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
  const [actionExecutions, setActionExecutions] = useState<EmailActionExecution[]>([]);
  const [selectedActionId, setSelectedActionId] = useState('');

  const loadActions = async (append = false, cursor?: string) => {
    try {
      const data = await actionSvc.loadActions(actionApplicationId, actionStatus, cursor);
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

  return {
    actions,
    actionsCursor,
    actionApplicationId,
    setActionApplicationId,
    actionStatus,
    setActionStatus,
    actionExecutions,
    selectedActionId,
    setSelectedActionId,
    loadActions,
    loadActionExecutions,
    executeAction,
  };
}
