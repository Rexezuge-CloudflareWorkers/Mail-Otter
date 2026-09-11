import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  renderActionDetails,
  renderConfirmationPage,
  renderEmailActionSection,
  renderResultDetails,
  renderResultPage,
} from '../../packages/backend-services/src/action/ActionRenderService';
import type { EmailAction } from '@mail-otter/shared/model';

function makeAction(actionType: string, payload: Record<string, unknown>, overrides?: Record<string, unknown>): EmailAction {
  return {
    actionId: 'action-1',
    applicationId: 'app-1',
    userEmail: 'user@example.com',
    providerId: 'google-gmail',
    providerMessageId: 'msg-1',
    actionType,
    status: 'pending',
    riskLevel: 'low',
    title: 'Test <Action>',
    description: 'Description with "quotes" & ampersands.',
    payload: { type: actionType, title: 'Test action', description: 'Test description', ...payload },
    expiresAt: 1_998_200_000,
    createdAt: 1_778_200_000,
    updatedAt: 1_778_200_000,
    ...overrides,
  } as unknown as EmailAction;
}

describe('escapeHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('escapes markup-significant characters', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe('&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('Buy milk')).toBe('Buy milk');
  });
});

describe('renderActionDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders calendar events with and without a location', () => {
    const withLocation = renderActionDetails(
      makeAction('calendar.add_event', {
        eventTitle: 'Sync',
        startTime: '2026-10-01T10:00:00Z',
        endTime: '2026-10-01T11:00:00Z',
        timeZone: 'UTC',
        location: 'Room 1',
      }),
      'en',
    );
    expect(withLocation).toContain('Room 1');

    const withoutLocation = renderActionDetails(
      makeAction('calendar.add_event', {
        eventTitle: 'Sync',
        startTime: '2026-10-01T10:00:00Z',
        endTime: '2026-10-01T11:00:00Z',
        timeZone: 'UTC',
      }),
      'en',
    );
    expect(withoutLocation).not.toContain('Room 1');
  });

  it('renders draft replies, links, and manual tasks', () => {
    expect(
      renderActionDetails(makeAction('email.draft_reply', { draftBody: 'Hello there' }), 'en'),
    ).toContain('Hello there');
    expect(
      renderActionDetails(makeAction('external.open_link', { url: 'https://example.com/x' }), 'en'),
    ).toContain('https://example.com/x');
    expect(
      renderActionDetails(makeAction('manual.todo', { instructions: 'File the report' }), 'en'),
    ).toContain('File the report');
  });

  it('renders package tracking with optional carrier and tracking URL', () => {
    const full = renderActionDetails(
      makeAction('delivery.track_package', {
        trackingNumber: '1Z999',
        carrier: 'UPS',
        trackingUrl: 'https://carrier.example.com/1Z999',
      }),
      'en',
    );
    expect(full).toContain('1Z999');
    expect(full).toContain('UPS');
    expect(full).toContain('https://carrier.example.com/1Z999');

    const minimal = renderActionDetails(makeAction('delivery.track_package', { trackingNumber: '1Z999' }), 'en');
    expect(minimal).toContain('1Z999');
    expect(minimal).not.toContain('carrier.example.com');
  });

  it('renders flight tracking with optional airline, route, departure, and tracking URL', () => {
    const full = renderActionDetails(
      makeAction('travel.track_flight', {
        flightNumber: 'LH400',
        airline: 'Lufthansa',
        departureAirport: 'JFK',
        arrivalAirport: 'FRA',
        departureTime: '2026-10-01T10:00:00Z',
        trackingUrl: 'https://flights.example.com/LH400',
      }),
      'en',
    );
    expect(full).toContain('LH400');
    expect(full).toContain('Lufthansa');
    expect(full).toContain('JFK');
    expect(full).toContain('https://flights.example.com/LH400');

    const minimal = renderActionDetails(makeAction('travel.track_flight', { flightNumber: 'LH400' }), 'en');
    expect(minimal).toContain('LH400');
    expect(minimal).not.toContain('flights.example.com');
  });

  it('renders bill payment with optional payee, amount, currency, due date, invoice, and payment URL', () => {
    const full = renderActionDetails(
      makeAction('finance.pay_bill', {
        payee: 'Power Co',
        amount: '42.50',
        currency: 'USD',
        dueDate: '2026-11-01',
        invoiceNumber: 'INV-7',
        paymentUrl: 'https://pay.example.com/INV-7',
      }),
      'en',
    );
    expect(full).toContain('Power Co');
    expect(full).toContain('42.50');
    expect(full).toContain('USD');
    expect(full).toContain('INV-7');
    expect(full).toContain('https://pay.example.com/INV-7');

    const minimal = renderActionDetails(makeAction('finance.pay_bill', {}), 'en');
    expect(minimal).not.toContain('https://pay.example.com');
  });

  it('renders appointment confirmations with optional fields', () => {
    const full = renderActionDetails(
      makeAction('appointment.confirm', {
        serviceType: 'Dentist',
        providerName: 'Dr. Smile',
        appointmentTime: '2026-10-02T09:00:00Z',
        location: 'Main St 1',
        confirmationNumber: 'C-123',
        notes: 'Bring insurance card',
      }),
      'en',
    );
    expect(full).toContain('Dentist');
    expect(full).toContain('C-123');

    const minimal = renderActionDetails(makeAction('appointment.confirm', {}), 'en');
    expect(minimal).not.toContain('C-123');
  });
});

describe('renderResultDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links provider URLs when present', () => {
    const html = renderResultDetails({ summary: 'Done', providerUrl: 'https://provider.example.com/e/1' }, 'en');
    expect(html).toContain('Done');
    expect(html).toContain('https://provider.example.com/e/1');
  });

  it('falls back to external URLs', () => {
    const html = renderResultDetails({ summary: 'Done', externalUrl: 'https://example.com/x' }, 'en');
    expect(html).toContain('https://example.com/x');
  });

  it('omits the link section without any URL', () => {
    const html = renderResultDetails({ summary: 'Done' }, 'en');
    expect(html).toContain('Done');
    expect(html).not.toContain('<a href');
  });
});

describe('renderConfirmationPage states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the confirm form for pending, unexpired actions', () => {
    const html = renderConfirmationPage(makeAction('manual.todo', { instructions: 'Do it' }), 'token-1', 'en');
    expect(html).toContain('<form');
    expect(html).toContain('token-1');
  });

  it('shows the expired error for past-due actions', () => {
    const html = renderConfirmationPage(
      makeAction('manual.todo', { instructions: 'Do it' }, { expiresAt: 1_000_000_000 }),
      'token-1',
      'en',
    );
    expect(html).not.toContain('<form');
  });

  it('shows the no-longer-pending note for executed actions', () => {
    const html = renderConfirmationPage(
      makeAction('manual.todo', { instructions: 'Do it' }, { status: 'succeeded' }),
      'token-1',
      'en',
    );
    expect(html).not.toContain('<form');
  });

  it('embeds the stored result when present', () => {
    const html = renderConfirmationPage(
      makeAction(
        'manual.todo',
        { instructions: 'Do it' },
        { result: { summary: 'Already done', providerUrl: 'https://provider.example.com/e/9' } },
      ),
      'token-1',
      'en',
    );
    expect(html).toContain('Already done');
  });

  it('escapes action titles and descriptions', () => {
    const html = renderConfirmationPage(makeAction('manual.todo', { instructions: 'Do it' }), 'token-1', 'en');
    expect(html).toContain('Test &lt;Action&gt;');
    expect(html).toContain('&quot;quotes&quot;');
  });
});

describe('renderResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders status with result and error message', () => {
    const html = renderResultPage(
      makeAction(
        'manual.todo',
        { instructions: 'Do it' },
        {
          status: 'failed',
          errorMessage: 'Provider <timeout>',
          result: { summary: 'Partial', externalUrl: 'https://example.com/p' },
        },
      ),
      'en',
    );
    expect(html).toContain('Provider &lt;timeout&gt;');
    expect(html).toContain('Partial');
  });

  it('renders clean success pages without error or result sections', () => {
    const html = renderResultPage(makeAction('manual.todo', { instructions: 'Do it' }, { status: 'succeeded' }), 'en');
    expect(html).toContain('succeeded');
    expect(html).not.toContain('class="error"');
  });
});

describe('renderEmailActionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty string without actions', () => {
    expect(renderEmailActionSection([], 'en')).toBe('');
  });

  it('lists actions with confirmation links and expiry', () => {
    const html = renderEmailActionSection(
      [
        {
          action: makeAction('manual.todo', { instructions: 'Do it' }),
          confirmationUrl: 'https://app.example.com/actions/abc',
        } as never,
      ],
      'en',
    );
    expect(html).toContain('https://app.example.com/actions/abc');
    expect(html).toContain('<ul>');
  });
});
