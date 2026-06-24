import type { EmailActionExecutionTrigger, EmailActionRiskLevel, EmailActionStatus, EmailActionType, ProviderId } from '../constants';

interface EmailAction {
  actionId: string;
  processedMessageId: string;
  applicationId: string;
  userEmail: string;
  providerId: ProviderId;
  providerMessageId: string;
  providerThreadId?: string | null | undefined;
  actionType: EmailActionType;
  status: EmailActionStatus;
  riskLevel: EmailActionRiskLevel;
  title: string;
  description: string;
  payload: EmailActionPayload;
  result?: EmailActionResult | null | undefined;
  errorMessage?: string | null | undefined;
  syncStatus?: string | null | undefined;
  expiresAt: number;
  executedAt?: number | null | undefined;
  createdAt: number;
  updatedAt: number;
}

interface EmailActionInternal {
  action_id: string;
  processed_message_id: string;
  application_id: string;
  user_email: string;
  provider_id: ProviderId;
  provider_message_id: string;
  provider_thread_id: string | null;
  action_type: EmailActionType;
  status: EmailActionStatus;
  risk_level: EmailActionRiskLevel;
  token_hash: string;
  encrypted_payload: string;
  payload_iv: string;
  payload_salt: string;
  encrypted_result: string | null;
  result_iv: string | null;
  result_salt: string | null;
  error_message: string | null;
  sync_status: string | null;
  expires_at: number;
  executed_at: number | null;
  created_at: number;
  updated_at: number;
}

interface EmailActionList {
  actions: EmailAction[];
  nextCursor?: string | undefined;
}

interface EmailActionExecution {
  executionId: string;
  actionId: string;
  attempt: number;
  triggeredBy: EmailActionExecutionTrigger;
  status: EmailActionStatus;
  providerOperationId?: string | null | undefined;
  requestUserAgentHash?: string | null | undefined;
  errorMessage?: string | null | undefined;
  createdAt: number;
  completedAt?: number | null | undefined;
}

interface EmailActionExecutionInternal {
  execution_id: string;
  action_id: string;
  attempt: number;
  triggered_by: EmailActionExecutionTrigger;
  status: EmailActionStatus;
  provider_operation_id: string | null;
  request_user_agent_hash: string | null;
  error_message: string | null;
  created_at: number;
  completed_at: number | null;
}

interface EmailActionExecutionList {
  executions: EmailActionExecution[];
}

type EmailActionPayload =
  | CalendarAddEventActionPayload
  | EmailDraftReplyActionPayload
  | ExternalOpenLinkActionPayload
  | ManualTodoActionPayload
  | DeliveryTrackPackageActionPayload
  | TravelTrackFlightActionPayload
  | FinancePayBillActionPayload
  | AppointmentConfirmActionPayload;

interface EmailActionPayloadBase {
  title: string;
  description: string;
  sourceSubject?: string | undefined;
  sourceFrom?: string | undefined;
}

interface CalendarAddEventActionPayload extends EmailActionPayloadBase {
  type: 'calendar.add_event';
  eventTitle: string;
  startTime: string;
  endTime: string;
  timeZone: string;
  location?: string | undefined;
  notes?: string | undefined;
}

interface EmailDraftReplyActionPayload extends EmailActionPayloadBase {
  type: 'email.draft_reply';
  draftSubject?: string | undefined;
  draftBody: string;
}

interface ExternalOpenLinkActionPayload extends EmailActionPayloadBase {
  type: 'external.open_link';
  url: string;
}

interface ManualTodoActionPayload extends EmailActionPayloadBase {
  type: 'manual.todo';
  instructions: string;
}

interface DeliveryTrackPackageActionPayload extends EmailActionPayloadBase {
  type: 'delivery.track_package';
  trackingNumber: string;
  carrier?: string | undefined;
  trackingUrl?: string | undefined;
}

interface TravelTrackFlightActionPayload extends EmailActionPayloadBase {
  type: 'travel.track_flight';
  flightNumber: string;
  airline?: string | undefined;
  departureAirport?: string | undefined;
  arrivalAirport?: string | undefined;
  departureTime?: string | undefined;
  trackingUrl?: string | undefined;
}

interface FinancePayBillActionPayload extends EmailActionPayloadBase {
  type: 'finance.pay_bill';
  payee?: string | undefined;
  amount?: string | undefined;
  currency?: string | undefined;
  dueDate?: string | undefined;
  invoiceNumber?: string | undefined;
  paymentUrl?: string | undefined;
}

interface AppointmentConfirmActionPayload extends EmailActionPayloadBase {
  type: 'appointment.confirm';
  serviceType?: string | undefined;
  providerName?: string | undefined;
  appointmentTime?: string | undefined;
  location?: string | undefined;
  confirmationNumber?: string | undefined;
  notes?: string | undefined;
}

interface EmailActionProposal {
  type:
    | 'calendar.add_event'
    | 'email.draft_reply'
    | 'external.open_link'
    | 'manual.todo'
    | 'delivery.track_package'
    | 'travel.track_flight'
    | 'finance.pay_bill'
    | 'appointment.confirm';
  title: string;
  description: string;
  confidence?: number | undefined;
  parameters?: Record<string, unknown> | undefined;
}

interface EmailActionResult {
  summary: string;
  providerOperationId?: string | undefined;
  providerUrl?: string | undefined;
  externalUrl?: string | undefined;
}

export type {
  AppointmentConfirmActionPayload,
  CalendarAddEventActionPayload,
  DeliveryTrackPackageActionPayload,
  EmailAction,
  EmailActionExecution,
  EmailActionExecutionInternal,
  EmailActionExecutionList,
  EmailActionInternal,
  EmailActionList,
  EmailActionPayload,
  EmailActionProposal,
  EmailActionResult,
  EmailDraftReplyActionPayload,
  ExternalOpenLinkActionPayload,
  FinancePayBillActionPayload,
  ManualTodoActionPayload,
  TravelTrackFlightActionPayload,
};
