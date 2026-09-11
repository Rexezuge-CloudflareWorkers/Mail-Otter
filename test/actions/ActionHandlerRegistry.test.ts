import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
} from '@mail-otter/shared/constants';
import { getBackendStrings } from '@mail-otter/shared/i18n';
import type { EmailAction } from '@mail-otter/shared/model';
import { ActionHandlerRegistry } from '@mail-otter/backend-services/action/handlers/ActionHandlerRegistry';
import type { ActionHandlerContext } from '@mail-otter/backend-services/action/handlers/IActionHandler';
import type { ActionExecutionEnv } from '@mail-otter/backend-services/action/ActionExecutionService';

const ALL_ACTION_TYPES = [
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_MANUAL_TODO,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
];

function makeContext(): ActionHandlerContext {
  return {
    env: {} as ActionExecutionEnv,
    locale: 'en',
    strings: getBackendStrings('en'),
  };
}

function makeAction(actionType: string, payload: Record<string, unknown>): EmailAction {
  return {
    actionId: 'action-1',
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    providerMessageId: 'msg-1',
    actionType,
    status: 'pending',
    riskLevel: 'low',
    title: 'Test action',
    description: 'Test description',
    payload: { type: actionType, title: 'Test action', description: 'Test description', ...payload },
    expiresAt: 1_998_200_000,
    createdAt: 1_778_200_000,
    updatedAt: 1_778_200_000,
  } as unknown as EmailAction;
}

describe('ActionHandlerRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('resolves a handler for every known action type', () => {
      for (const actionType of ALL_ACTION_TYPES) {
        expect(ActionHandlerRegistry.get(actionType), actionType).toBeDefined();
      }
    });

    it('returns undefined for unknown action types', () => {
      expect(ActionHandlerRegistry.get('email.unknown_action')).toBeUndefined();
      expect(ActionHandlerRegistry.get('')).toBeUndefined();
    });
  });

  describe('getHandlers', () => {
    it('exposes the full eight-handler map', () => {
      const handlers = ActionHandlerRegistry.getHandlers();
      expect(handlers.size).toBe(8);
      expect([...handlers.keys()].sort()).toEqual([...ALL_ACTION_TYPES].sort());
    });
  });

  describe('pure handlers', () => {
    it('acknowledges external links with the payload URL', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK);
      const result = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK, { url: 'https://example.com/x' }),
        makeContext(),
      );

      expect(result?.summary).toBe('External link reviewed.');
      expect(result?.externalUrl).toBe('https://example.com/x');
    });

    it('acknowledges manual todos', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_MANUAL_TODO);
      const result = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_MANUAL_TODO, { instructions: 'Do the thing' }),
        makeContext(),
      );

      expect(result?.summary).toBe('Manual action acknowledged.');
    });

    it('notes package tracking without an API key or tracking URL', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE);
      const result = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE, { trackingNumber: '1Z999', carrier: 'UPS' }),
        makeContext(),
      );

      expect(result?.summary).toBe('Package tracking noted: 1Z999 via UPS.');
    });

    it('opens the tracking URL when no API key is configured', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE);
      const result = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE, {
          trackingNumber: '1Z999',
          trackingUrl: 'https://carrier.example.com/1Z999',
        }),
        makeContext(),
      );

      expect(result?.summary).toBe('Package tracking link opened.');
      expect(result?.externalUrl).toBe('https://carrier.example.com/1Z999');
    });

    it('notes flight tracking without an API key or tracking URL', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT);
      const result = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT, { flightNumber: 'LH400' }),
        makeContext(),
      );

      expect(result?.summary).toBe('Flight LH400 details noted.');
    });

    it('opens the payment URL for pay-bill actions', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_FINANCE_PAY_BILL);
      const result = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_FINANCE_PAY_BILL, { paymentUrl: 'https://pay.example.com/inv-1' }),
        makeContext(),
      );

      expect(result?.summary).toBe('Payment link opened.');
      expect(result?.externalUrl).toBe('https://pay.example.com/inv-1');
    });

    it('notes bill reminders without a payment URL', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_FINANCE_PAY_BILL);
      const result = await handler?.execute(makeAction(EMAIL_ACTION_TYPE_FINANCE_PAY_BILL, {}), makeContext());

      expect(result?.summary).toBe('Bill payment reminder noted.');
    });

    it('notes appointment confirmations with and without a time', async () => {
      const handler = ActionHandlerRegistry.get(EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM);

      const withTime = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM, { appointmentTime: '2026-10-01T10:00:00Z' }),
        makeContext(),
      );
      expect(withTime?.summary).toBe('Appointment on 2026-10-01T10:00:00Z details noted.');

      const withoutTime = await handler?.execute(
        makeAction(EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM, {}),
        makeContext(),
      );
      expect(withoutTime?.summary).toBe('Appointment details noted.');
    });
  });
});
