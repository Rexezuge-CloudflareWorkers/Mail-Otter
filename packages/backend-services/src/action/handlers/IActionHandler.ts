import type { EmailActionType } from '@mail-otter/shared/constants';
import type { BackendLocaleStrings } from '@mail-otter/shared/i18n';
import type { EmailAction, EmailActionResult } from '@mail-otter/shared/model';
import type { ActionExecutionEnv } from '../ActionExecutionService';

// Command registry contract for email action execution.
// Each EmailActionType maps to one handler; executeProviderOperation dispatches via the registry.
interface ActionHandlerContext {
  env: ActionExecutionEnv;
  locale: string;
  strings: BackendLocaleStrings;
}

interface IActionHandler {
  execute(action: EmailAction, ctx: ActionHandlerContext): Promise<EmailActionResult>;
}

type HandlerMap = ReadonlyMap<EmailActionType, IActionHandler>;

export type { ActionHandlerContext, HandlerMap, IActionHandler };
