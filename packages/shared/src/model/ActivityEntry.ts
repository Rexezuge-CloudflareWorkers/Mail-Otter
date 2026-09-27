interface EmailProcessedEntry {
  eventType: 'email_processed';
  applicationId: string;
  providerMessageId: string;
  status: 'processing' | 'summarized' | 'skipped' | 'error';
  errorMessage?: string | null;
  timestamp: number;
}

interface ActionCreatedEntry {
  eventType: 'action_created';
  applicationId: string;
  actionId: string;
  actionType: string;
  riskLevel: string;
  timestamp: number;
}

interface ActionExecutedEntry {
  eventType: 'action_executed';
  applicationId: string;
  actionId: string;
  /**
   * Unique per execution. An action can be executed more than once, so
   * `actionId` is not a key on its own — and this is the tiebreaker the
   * activity feed's cursor paginates on.
   */
  executionId: string;
  actionType: string;
  executionStatus: string;
  triggeredBy: string;
  timestamp: number;
}

type ActivityEntry = EmailProcessedEntry | ActionCreatedEntry | ActionExecutedEntry;
type ActivityEventType = 'email_processed' | 'action_created' | 'action_executed';

interface ActivityEntryList {
  entries: ActivityEntry[];
  nextCursor?: string;
}

export type { ActivityEntry, ActivityEntryList, ActivityEventType, EmailProcessedEntry, ActionCreatedEntry, ActionExecutedEntry };
