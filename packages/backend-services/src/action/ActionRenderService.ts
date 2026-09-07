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
import { getBackendStrings } from '@mail-otter/shared/i18n';
import { LocaleUtil, TimestampUtil } from '@mail-otter/shared/utils';
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

function renderPage(title: string, body: string, locale?: string | null): string {
  const lang = LocaleUtil.normalize(locale);
  return `<!doctype html>
<html lang="${lang}">
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

function renderMessagePage(title: string, message: string, locale?: string | null): string {
  return renderPage(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`, locale);
}

function renderResultDetails(result: EmailActionResult, locale?: string | null): string {
  const strings = getBackendStrings(locale);
  return [
    '<section>',
    `<h2>${escapeHtml(strings.actionPage.resultHeading)}</h2>`,
    `<p>${escapeHtml(result.summary)}</p>`,
    result.providerUrl || result.externalUrl
      ? `<p><a href="${escapeHtml(result.providerUrl || result.externalUrl || '')}" rel="noopener noreferrer">${escapeHtml(strings.actionPage.openResult)}</a></p>`
      : '',
    '</section>',
  ].join('\n');
}

function renderActionDetails(action: EmailAction, locale?: string | null): string {
  const strings = getBackendStrings(locale);
  const payload: EmailActionPayload = action.payload;
  if (payload.type === EMAIL_ACTION_TYPE_CALENDAR_ADD_EVENT) {
    return [
      `<section><h2>${escapeHtml(strings.actionPage.calendarEvent)}</h2>`,
      `<p><strong>${escapeHtml(strings.actionPage.titleLabel)}</strong> ${escapeHtml(payload.eventTitle)}</p>`,
      `<p><strong>${escapeHtml(strings.actionPage.startLabel)}</strong> ${escapeHtml(payload.startTime)} ${escapeHtml(payload.timeZone)}</p>`,
      `<p><strong>${escapeHtml(strings.actionPage.endLabel)}</strong> ${escapeHtml(payload.endTime)} ${escapeHtml(payload.timeZone)}</p>`,
      payload.location ? `<p><strong>${escapeHtml(strings.actionPage.locationLabel)}</strong> ${escapeHtml(payload.location)}</p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_EMAIL_DRAFT_REPLY) {
    return `<section><h2>${escapeHtml(strings.actionPage.draftReply)}</h2><pre>${escapeHtml(payload.draftBody)}</pre></section>`;
  }
  if (payload.type === EMAIL_ACTION_TYPE_EXTERNAL_OPEN_LINK) {
    return `<section><h2>${escapeHtml(strings.actionPage.linkHeading)}</h2><p>${escapeHtml(payload.url)}</p></section>`;
  }
  if (payload.type === EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE) {
    const p = payload;
    return [
      `<section><h2>${escapeHtml(strings.actionPage.packageTracking)}</h2>`,
      `<p><strong>${escapeHtml(strings.actionPage.trackingNumberLabel)}</strong> ${escapeHtml(p.trackingNumber)}</p>`,
      p.carrier ? `<p><strong>${escapeHtml(strings.actionPage.carrierLabel)}</strong> ${escapeHtml(p.carrier)}</p>` : '',
      p.trackingUrl ? `<p><a href="${escapeHtml(p.trackingUrl)}" rel="noopener noreferrer">${escapeHtml(strings.actionPage.trackPackageLink)}</a></p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT) {
    const p = payload;
    return [
      `<section><h2>${escapeHtml(strings.actionPage.flightHeading)}</h2>`,
      `<p><strong>${escapeHtml(strings.actionPage.flightLabel)}</strong> ${escapeHtml(p.flightNumber)}</p>`,
      p.airline ? `<p><strong>${escapeHtml(strings.actionPage.airlineLabel)}</strong> ${escapeHtml(p.airline)}</p>` : '',
      p.departureAirport || p.arrivalAirport
        ? `<p><strong>${escapeHtml(strings.actionPage.routeLabel)}</strong> ${escapeHtml(p.departureAirport || '?')} → ${escapeHtml(p.arrivalAirport || '?')}</p>`
        : '',
      p.departureTime ? `<p><strong>${escapeHtml(strings.actionPage.departureLabel)}</strong> ${escapeHtml(p.departureTime)}</p>` : '',
      p.trackingUrl ? `<p><a href="${escapeHtml(p.trackingUrl)}" rel="noopener noreferrer">${escapeHtml(strings.actionPage.trackFlightLink)}</a></p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_FINANCE_PAY_BILL) {
    const p = payload;
    return [
      `<section><h2>${escapeHtml(strings.actionPage.billPayment)}</h2>`,
      p.payee ? `<p><strong>${escapeHtml(strings.actionPage.payeeLabel)}</strong> ${escapeHtml(p.payee)}</p>` : '',
      p.amount ? `<p><strong>${escapeHtml(strings.actionPage.amountLabel)}</strong> ${escapeHtml(p.amount)}${p.currency ? ` ${escapeHtml(p.currency)}` : ''}</p>` : '',
      p.dueDate ? `<p><strong>${escapeHtml(strings.actionPage.dueLabel)}</strong> ${escapeHtml(p.dueDate)}</p>` : '',
      p.invoiceNumber ? `<p><strong>${escapeHtml(strings.actionPage.invoiceLabel)}</strong> ${escapeHtml(p.invoiceNumber)}</p>` : '',
      p.paymentUrl ? `<p><a href="${escapeHtml(p.paymentUrl)}" rel="noopener noreferrer">${escapeHtml(strings.actionPage.payNowLink)}</a></p>` : '',
      '</section>',
    ].join('\n');
  }
  if (payload.type === EMAIL_ACTION_TYPE_APPOINTMENT_CONFIRM) {
    const p = payload;
    return [
      `<section><h2>${escapeHtml(strings.actionPage.appointmentHeading)}</h2>`,
      p.serviceType ? `<p><strong>${escapeHtml(strings.actionPage.serviceLabel)}</strong> ${escapeHtml(p.serviceType)}</p>` : '',
      p.providerName ? `<p><strong>${escapeHtml(strings.actionPage.providerLabel)}</strong> ${escapeHtml(p.providerName)}</p>` : '',
      p.appointmentTime ? `<p><strong>${escapeHtml(strings.actionPage.whenLabel)}</strong> ${escapeHtml(p.appointmentTime)}</p>` : '',
      p.location ? `<p><strong>${escapeHtml(strings.actionPage.locationLabel)}</strong> ${escapeHtml(p.location)}</p>` : '',
      p.confirmationNumber ? `<p><strong>${escapeHtml(strings.actionPage.confirmationLabel)}</strong> ${escapeHtml(p.confirmationNumber)}</p>` : '',
      p.notes ? `<p><strong>${escapeHtml(strings.actionPage.notesLabel)}</strong> ${escapeHtml(p.notes)}</p>` : '',
      '</section>',
    ].join('\n');
  }
  const manualPayload = payload;
  return `<section><h2>${escapeHtml(strings.actionPage.manualTask)}</h2><p>${escapeHtml(manualPayload.instructions)}</p></section>`;
}

function renderConfirmationPage(action: EmailAction, token: string, locale?: string | null): string {
  const strings = getBackendStrings(locale);
  const expired: boolean = action.expiresAt <= TimestampUtil.getCurrentUnixTimestampInSeconds() || action.status === EMAIL_ACTION_STATUS_EXPIRED;
  const alreadyDone: boolean = action.status !== EMAIL_ACTION_STATUS_PENDING;
  const details: string = renderActionDetails(action, locale);
  return renderPage(
    `${strings.actionPage.confirmTitlePrefix}${action.title}`,
    [
      `<h1>${escapeHtml(action.title)}</h1>`,
      `<p>${escapeHtml(action.description)}</p>`,
      details,
      `<p><strong>${escapeHtml(strings.actionPage.statusLabel)}</strong> ${escapeHtml(action.status)}</p>`,
      `<p><strong>${escapeHtml(strings.actionPage.expiresLabel)}</strong> ${escapeHtml(new Date(action.expiresAt * 1000).toUTCString())}</p>`,
      expired
        ? `<p class="error">${escapeHtml(strings.actionPage.expiredError)}</p>`
        : alreadyDone
          ? `<p>${escapeHtml(strings.actionPage.noLongerPending)}</p>`
          : `<form method="post" action="/api/actions/${encodeURIComponent(action.actionId)}/execute?token=${encodeURIComponent(token)}"><button type="submit">${escapeHtml(strings.actionPage.confirmButton)}</button></form>`,
      action.result ? renderResultDetails(action.result, locale) : '',
    ].join('\n'),
    locale,
  );
}

function renderResultPage(action: EmailAction, locale?: string | null): string {
  const strings = getBackendStrings(locale);
  return renderPage(
    `${strings.actionPage.resultTitlePrefix}${action.status}`,
    [
      `<h1>${escapeHtml(action.title)}</h1>`,
      `<p><strong>${escapeHtml(strings.actionPage.statusLabel)}</strong> ${escapeHtml(action.status)}</p>`,
      action.errorMessage ? `<p class="error">${escapeHtml(action.errorMessage)}</p>` : '',
      action.result ? renderResultDetails(action.result, locale) : '',
    ].join('\n'),
    locale,
  );
}

function renderActionItems(actions: CreatedEmailAction[], locale?: string | null): string[] {
  const strings = getBackendStrings(locale);
  const tag = LocaleUtil.normalize(locale);
  return actions.map((item: CreatedEmailAction): string => {
    const expires: string = new Date(item.action.expiresAt * 1000).toLocaleString(tag, { timeZone: 'UTC', timeZoneName: 'short' });
    return [
      '<li>',
      `<strong><a href="${escapeHtml(item.confirmationUrl)}">${escapeHtml(item.action.title)}</a></strong><br>`,
      `${escapeHtml(item.action.description)}<br>`,
      ` <span style="color:#666;">${escapeHtml(`${strings.actionPage.expiresPrefix}${expires}`)}</span>`,
      '</li>',
    ].join('');
  });
}

function renderEmailActionSection(actions: CreatedEmailAction[], locale?: string | null): string {
  if (actions.length === 0) return '';
  const strings = getBackendStrings(locale);
  return [
    '',
    `<p><strong>${escapeHtml(strings.actionPage.actionsHeading)}</strong></p>`,
    '<ul>',
    ...renderActionItems(actions, locale),
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
