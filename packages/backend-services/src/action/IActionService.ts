import type { UserScope } from '@mail-otter/backend-data/dao';
import type { EmailAction, EmailActionExecutionList, EmailActionList } from '@mail-otter/shared/model';
import type { ActionHtmlResponse, ActionCallbackEnv, UserActionEnv } from './ActionExecutionService';
import type { ActionCreationEnv, CreatedEmailAction, CreateActionsForSummaryInput } from './ActionCreationService';
import type { ActionMaintenanceEnv } from './ActionMaintenanceService';
import type { ListActionsInput, UserActionListEnv } from './ActionService';

interface IActionService {
  createActionsForSummary(input: CreateActionsForSummaryInput, env: ActionCreationEnv): Promise<CreatedEmailAction[]>;
  renderEmailActionSection(actions: CreatedEmailAction[], locale?: string | null): string;
  getConfirmationResponse(actionId: string, token: string, env: ActionCallbackEnv): Promise<ActionHtmlResponse>;
  executeActionWithToken(actionId: string, token: string, request: Request, env: ActionCallbackEnv): Promise<ActionHtmlResponse>;
  executeActionForUser(actionId: string, scope: UserScope, request: Request, env: UserActionEnv): Promise<EmailAction>;
  listActionsForUser(scope: UserScope, input: ListActionsInput, env: UserActionListEnv): Promise<EmailActionList>;
  listExecutionsForUser(actionId: string, scope: UserScope, env: UserActionListEnv): Promise<EmailActionExecutionList>;
  expirePendingActions(env: ActionMaintenanceEnv, limit: number): Promise<number>;
  deleteOldActions(env: ActionMaintenanceEnv, limit: number): Promise<number>;
}

export type { IActionService };
