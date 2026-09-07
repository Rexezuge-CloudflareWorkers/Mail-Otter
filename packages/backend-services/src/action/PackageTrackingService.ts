import { getBackendStrings } from '@mail-otter/shared/i18n';
import { LocaleUtil } from '@mail-otter/shared/utils';

const AFTERSHIP_API_BASE = 'https://api.aftership.com/tracking/2024-10';

// Maps common carrier name substrings (lower-cased) to Aftership slugs.
const CARRIER_SLUG_MAP: [string, string][] = [
  ['ups', 'ups'],
  ['fedex', 'fedex'],
  ['usps', 'usps'],
  ['dhl', 'dhl'],
  ['amazon', 'amazon'],
  ['ontrac', 'ontrac'],
  ['lasership', 'lasership'],
  ['lso', 'lasership'],
  ['purolator', 'purolator'],
  ['canada post', 'canada-post'],
  ['royal mail', 'royal-mail'],
  ['australia post', 'australia-post'],
];

const TAG_LABELS: Record<string, string> = {
  Delivered: 'Delivered',
  OutForDelivery: 'Out For Delivery',
  InTransit: 'In Transit',
  AttemptFail: 'Delivery Attempted',
  Exception: 'Exception',
  AvailableForPickup: 'Available For Pickup',
  Pending: 'Label Created',
  InfoReceived: 'Label Created',
  Expired: 'Expired',
};

function tagLabelFor(tag: string, locale?: string | null): string {
  const strings = getBackendStrings(locale);
  switch (tag) {
    case 'Delivered': { return strings.tracking.tagDelivered; }
    case 'OutForDelivery': { return strings.tracking.tagOutForDelivery; }
    case 'InTransit': { return strings.tracking.tagInTransit; }
    case 'AttemptFail': { return strings.tracking.tagAttemptFail; }
    case 'Exception': { return strings.tracking.tagException; }
    case 'AvailableForPickup': { return strings.tracking.tagAvailableForPickup; }
    case 'Pending':
    case 'InfoReceived': { return strings.tracking.tagLabelCreated; }
    case 'Expired': { return strings.tracking.tagExpired; }
    default: { return tag; }
  }
}

interface AftershippCheckpoint {
  message?: string;
  city?: string;
  state?: string;
  created_at?: string;
}

interface AftershippTracking {
  tag?: string;
  expected_delivery?: string;
  checkpoints?: AftershippCheckpoint[];
}


interface PackageTrackingStatus {
  summary: string;
}

function resolveSlug(carrier: string | undefined): string | undefined {
  if (!carrier) return undefined;
  const lower = carrier.toLowerCase();
  for (const [fragment, slug] of CARRIER_SLUG_MAP) {
    if (lower.includes(fragment)) return slug;
  }
  return undefined;
}

function formatExpectedDelivery(raw: string, locale?: string | null): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(LocaleUtil.normalize(locale), { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildSummary(tracking: AftershippTracking, locale?: string | null): string {
  const tag = tracking.tag ?? '';
  const statusLabel = tagLabelFor(tag, locale);
  const strings = getBackendStrings(locale);

  const checkpoints = tracking.checkpoints ?? [];
  const latest = checkpoints.at(-1);
  const locationParts: string[] = [];
  if (latest) {
    if (latest.message) locationParts.push(latest.message);
    const place = [latest.city, latest.state].filter(Boolean).join(', ');
    if (place) locationParts.push(place);
  }

  let summary = statusLabel;
  if (locationParts.length > 0) summary += ` — ${locationParts.join(', ')}`;
  if (tracking.expected_delivery) {
    summary += `. ${strings.tracking.expectedPrefix}${formatExpectedDelivery(tracking.expected_delivery, locale)}`;
  }
  return summary;
}

async function fetchStatus(trackingNumber: string, carrier: string | undefined, apiKey: string, locale?: string | null): Promise<PackageTrackingStatus | null> {
  const slug = resolveSlug(carrier);
  const body: Record<string, unknown> = { tracking_number: trackingNumber };
  if (slug) body.slug = slug;

  try {
    const response = await fetch(`${AFTERSHIP_API_BASE}/trackings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'as-api-key': apiKey,
      },
      body: JSON.stringify({ tracking: body }),
    });

    // 201 Created or 409 Already Exists both include tracking data in the body.
    if (response.status !== 201 && response.status !== 409) return null;

    const json = JSON.parse(await response.text()) as { data?: { tracking?: Record<string, any> } };
    const tracking = json?.data?.tracking;
    if (!tracking) return null;

    return { summary: buildSummary(tracking, locale) };
  } catch {
    return null;
  }
}

export type { PackageTrackingStatus };
export { fetchStatus, formatExpectedDelivery, resolveSlug, TAG_LABELS };
