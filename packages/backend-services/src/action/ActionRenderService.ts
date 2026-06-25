import {
  EMAIL_ACTION_STATUS_EXPIRED,
  EMAIL_ACTION_STATUS_PENDING,
  EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM,
  EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT,
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY,
  EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK,
  EMAIL_ACTION_TYPE_FINANCE_PAY_BILL,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
} from '@mail-otter/shared/constants';
import { TimestampUtil } from '@mail-otter/shared/utils';
import type {
  EmailAction,
  EmailActionPayload,
  EmailActionResult,
} from '@mail-otter/shared/model';
import type { CreatedEmailAction } from './ActionCreationService';

function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/g, (char: string): string => {
    switch (char) {
      case '&': {
        return '&amp;';
      }
      case '<': {
        return '&lt;';
      }
      case '>': {
        return '&gt;';
      }
      case '"': {
        return '&quot;';
      }
      case "'": {
        return '&#39;';
      }
      default: {
        return char;
      }
    }
  });
}

function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; background: #101319; color: #f3f4f6; }
    main { max-width: 760px; margin: 0 auto; padding: 40px 20px; }
    section { margin: 20px 0; padding: 16px; border: 1px solid #2d3745; border-radius: 8px; background: #171c25; }
    button, a { display: inline-block; border: 0; border-radius: 6px; padding: 10px 14px; background: #0f766e; color: white; text-decoration: none; font-size: 16px; cursor: pointer; }
    pre { white-space: pre-wrap; color: #d1d5db; }
    .error { color: #fca5a5; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`;
}

function renderMessagePage(title: string, message: string): string {
  return renderPage(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`);
}

function renderResultDetails(result: EmailActionResult): string {
  return [
    '<section>',
    '<h2>Result</h2>',
    `<p>${escapeHtml(result.summary)}</p>`,
    result.providerUrl || result.externalUrl
      ? `<p><a href="${escapeHtml(result.providerUrl || result.externalUrl || '')}" rel="noopener noreferrer">Open result</a></p>`
      : '',
    '</section>',
  ].join('\n');
}

function renderActionDetails(action: EmailAction): string {
  const payload: EmailActionPayload = action.payload;
  if (payload.type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
    return [
      '<section><h2>Calendar Event</h2>',
      `<p><strong>Title:</strong> ${escapeHtml(payload.eventTitle)}</p>`,
      `<p><strong>Start:</strong> ${escapeHtml(payload.startTime)} ${escapeHtml(payload.timeZone)}</p>`,
      `<p><strong>End:</strong> ${escapeHtml(payload.endTime)} ${escapeHtml(payload.timeZone)}</p>`,
      payload.location ? `<p><strong>Location:</strong> ${escapeHtml(payload.location)}</p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
    return `<section><h2>Draft Reply</h2><pre>${escapeHtml(payload.draftBody)}</pre></section>`;
  }
  if (payload.type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
    return `<section><h2>Link</h2><p>${escapeHtml(payload.url)}</p></section>`;
  }
  if (payload.type === EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE) {
    const p = payload;
    return [
      '<section><h2>Package Tracking</h2>',
      `<p><strong>Tracking Number:</strong> ${escapeHtml(p.trackingNumber)}</p>`,
      p.carrier ? `<p><strong>Carrier:</strong> ${escapeHtml(p.carrier)}</p>` : '',
      p.trackingUrl ? `<p><a href="${escapeHtml(p.trackingUrl)}" rel="noopener noreferrer">Track package</a></p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT) {
    const p = payload;
    return [
      '<section><h2>Flight</h2>',
      `<p><strong>Flight:</strong> ${escapeHtml(p.flightNumber)}</p>`,
      p.airline ? `<p><strong>Airline:</strong> ${escapeHtml(p.airline)}</p>` : '',
      p.departureAirport || p.arrivalAirport
        ? `<p><strong>Route:</strong> ${escapeHtml(p.departureAirport || '?')} → ${escapeHtml(p.arrivalAirport || '?')}</p>`
        : '',
      p.departureTime ? `<p><strong>Departure:</strong> ${escapeHtml(p.departureTime)}</p>` : '',
      p.trackingUrl ? `<p><a href="${escapeHtml(p.trackingUrl)}" rel="noopener noreferrer">Track flight</a></p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_FINANCE_PAY_BILL) {
    const p = payload;
    return [
      '<section><h2>Bill Payment</h2>',
      p.payee ? `<p><strong>Payee:</strong> ${escapeHtml(p.payee)}</p>` : '',
      p.amount ? `<p><strong>Amount:</strong> ${escapeHtml(p.amount)}${p.currency ? ` ${escapeHtml(p.currency)}` : ''}</p>` : '',
      p.dueDate ? `<p><strong>Due:</strong> ${escapeHtml(p.dueDate)}</p>` : '',
      p.invoiceNumber ? `<p><strong>Invoice:</strong> ${escapeHtml(p.invoiceNumber)}</p>` : '',
      p.paymentUrl ? `<p><a href="${escapeHtml(p.paymentUrl)}" rel="noopener noreferrer">Pay now</a></p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM) {
    const p = payload;
    return [
      '<section><h2>Appointment</h2>',
      p.serviceType ? `<p><strong>Service:</strong> ${escapeHtml(p.serviceType)}</p>` : '',
      p.providerName ? `<p><strong>Provider:</strong> ${escapeHtml(p.providerName)}</p>` : '',
      p.appointmentTime ? `<p><strong>When:</strong> ${escapeHtml(p.appointmentTime)}</p>` : '',
      p.location ? `<p><strong>Location:</strong> ${escapeHtml(p.location)}</p>` : '',
      p.confirmationNumber ? `<p><strong>Confirmation:</strong> ${escapeHtml(p.confirmationNumber)}</p>` : '',
      p.notes ? `<p><strong>Notes:</strong> ${escapeHtml(p.notes)}</p>` : '',
      '</section>',
    ].join('\n');
  }
  const manualPayload = payload;
  return `<section><h2>Manual Task</h2><p>${escapeHtml(manualPayload.instructions)}</p></section>`;
}

function renderConfirmationPage(action: EmailAction, token: string): string {
  const expired: boolean = action.expiresAt <= TimestampUtil.getCurrentUnixTimestampInSeconds() || action.status === EMAIL_ACTION_STATUS_EXPIRED;
  const alreadyDone: boolean = action.status !== EMAIL_ACTION_STATUS_PENDING;
  const details: string = renderActionDetails(action);
  return renderPage(
    `Confirm ${action.title}`,
    [
      `<h1>${escapeHtml(action.title)}</h1>`,
      `<p>${escapeHtml(action.description)}</p>`,
      details,
      `<p><strong>Status:</strong> ${escapeHtml(action.status)}</p>`,
      `<p><strong>Expires:</strong> ${escapeHtml(new Date(action.expiresAt * 1000).toUTCString())}</p>`,
      expired
        ? '<p class="error">This action has expired.</p>'
        : alreadyDone
          ? '<p>This action is no longer pending. The latest result is shown below.</p>'
          : `<form method="post" action="/api/actions/${encodeURIComponent(action.actionId)}/execute?token=${encodeURIComponent(token)}"><button type="submit">Confirm action</button></form>`,
      action.result ? renderResultDetails(action.result) : '',
    ].join('\n'),
  );
}

function renderResultPage(action: EmailAction): string {
  return renderPage(
    `Action ${action.status}`,
    [
      `<h1>${escapeHtml(action.title)}</h1>`,
      `<p><strong>Status:</strong> ${escapeHtml(action.status)}</p>`,
      action.errorMessage ? `<p class="error">${escapeHtml(action.errorMessage)}</p>` : '',
      action.result ? renderResultDetails(action.result) : '',
    ].join('\n'),
  );
}

function renderActionItems(actions: CreatedEmailAction[]): string[] {
  return actions.map((item: CreatedEmailAction): string => {
    const expires: string = new Date(item.action.expiresAt * 1000).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' });
    return [
      '<li>',
      `<strong><a href="${escapeHtml(item.confirmationUrl)}">${escapeHtml(item.action.title)}</a></strong><br>`,
      `${escapeHtml(item.action.description)}<br>`,
      ` <span style="color:#666;">Expires ${escapeHtml(expires)}</span>`,
      '</li>',
    ].join('');
  });
}

function renderEmailActionSection(actions: CreatedEmailAction[]): string {
  if (actions.length === 0) return '';
  return [
    '',
    '<p><strong>Actions:</strong></p>',
    '<ul>',
    ...renderActionItems(actions),
    '</ul>',
  ].join('\n');
}

export {
  escapeHtml,
  renderPage,
  renderMessagePage,
  renderResultDetails,
  renderActionDetails,
  renderConfirmationPage,
  renderResultPage,
  renderActionItems,
  renderEmailActionSection,
};
