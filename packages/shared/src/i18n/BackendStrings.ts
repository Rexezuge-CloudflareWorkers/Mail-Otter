import type { SupportedLocale } from '../utils/LocaleUtil';

interface DigestStrings {
  subjectPrefix: string;
  title: string;
  subtitle: string;
  empty: string;
  footer: string;
  calendarHeading: string;
  tasksHeading: string;
  packagesHeading: string;
  flightsHeading: string;
  billsHeading: string;
  appointmentsHeading: string;
  trackLink: string;
  payLink: string;
  expectedLabel: string;
  duePrefix: string;
  atPrefix: string;
}

interface ActionPageStrings {
  notFoundTitle: string;
  notFoundBody: string;
  confirmTitlePrefix: string;
  resultTitlePrefix: string;
  statusLabel: string;
  expiresLabel: string;
  expiredError: string;
  noLongerPending: string;
  confirmButton: string;
  resultHeading: string;
  openResult: string;
  calendarEvent: string;
  titleLabel: string;
  startLabel: string;
  endLabel: string;
  locationLabel: string;
  draftReply: string;
  linkHeading: string;
  packageTracking: string;
  trackingNumberLabel: string;
  carrierLabel: string;
  trackPackageLink: string;
  flightHeading: string;
  flightLabel: string;
  airlineLabel: string;
  routeLabel: string;
  departureLabel: string;
  trackFlightLink: string;
  billPayment: string;
  payeeLabel: string;
  amountLabel: string;
  dueLabel: string;
  invoiceLabel: string;
  payNowLink: string;
  appointmentHeading: string;
  serviceLabel: string;
  providerLabel: string;
  whenLabel: string;
  confirmationLabel: string;
  notesLabel: string;
  manualTask: string;
  actionsHeading: string;
  expiresPrefix: string;
}

interface SummaryStrings {
  detailsHeading: string;
  noGist: string;
  noDetails: string;
  attachmentsHeading: string;
  poweredBy: string;
  summarySubjectPrefix: string;
  noSubject: string;
  unknownSender: string;
}

interface ChatStrings {
  noResponse: string;
  systemIntro1: string;
  systemIntro2: string;
  systemIntro3: string;
  systemIntro4: string;
  excerptsHeading: string;
  noContext: string;
  answerLanguageInstruction: string;
}

interface TrackingStrings {
  tagDelivered: string;
  tagOutForDelivery: string;
  tagInTransit: string;
  tagAttemptFail: string;
  tagException: string;
  tagAvailableForPickup: string;
  tagLabelCreated: string;
  tagExpired: string;
  flightScheduled: string;
  flightActive: string;
  flightLanded: string;
  flightCancelled: string;
  flightIncident: string;
  flightDiverted: string;
  flightUnknown: string;
  flightSummaryPrefix: string;
  departsPrefix: string;
  expectedPrefix: string;
}

interface NotifyStrings {
  newEmailPrefix: string;
  slackFromLabel: string;
  slackSummaryLabel: string;
  slackDetailsLabel: string;
  slackActionsLabel: string;
  discordFromField: string;
  discordDetailsField: string;
  discordActionsField: string;
  footerBrand: string;
  unknownFrom: string;
  testSubject: string;
  testFrom: string;
  testGist: string;
  testDetail1: string;
  testDetail2: string;
}

interface ResultStrings {
  externalLinkReviewed: string;
  manualAcknowledged: string;
  packageLinkOpened: string;
  packageNotedPrefix: string;
  packageNotedVia: string;
  flightLinkOpened: string;
  flightNotedPrefix: string;
  flightNotedSuffix: string;
  paymentLinkOpened: string;
  billReminderNoted: string;
  appointmentNotedPrefix: string;
  appointmentNotedOn: string;
  appointmentNotedSuffix: string;
}

interface CsvStrings {
  header: string;
}

interface BackendLocaleStrings {
  digest: DigestStrings;
  actionPage: ActionPageStrings;
  summary: SummaryStrings;
  chat: ChatStrings;
  tracking: TrackingStrings;
  notify: NotifyStrings;
  results: ResultStrings;
  csv: CsvStrings;
}

const AI_LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  nl: 'Dutch',
  pt: 'Portuguese',
  pl: 'Polish',
  ja: 'Japanese',
  'zh-CN': 'Simplified Chinese',
  'zh-TW': 'Traditional Chinese',
  ko: 'Korean',
};

function formatBackendString(template: string, vars: Record<string, string | number> = {}): string {
  return template.replaceAll(/\{(\w+)\}/g, (match: string, key: string): string => {
    const value: unknown = vars[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : match;
  });
}

export type {
  BackendLocaleStrings,
  DigestStrings,
  ActionPageStrings,
  SummaryStrings,
  ChatStrings,
  TrackingStrings,
  NotifyStrings,
  ResultStrings,
  CsvStrings,
};
export { AI_LANGUAGE_NAMES, formatBackendString };
