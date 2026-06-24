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

interface AftershippResponse {
  data?: {
    tracking?: AftershippTracking;
  };
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

function formatExpectedDelivery(raw: string): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildSummary(tracking: AftershippTracking): string {
  const tag = tracking.tag ?? '';
  const statusLabel = TAG_LABELS[tag] ?? tag;

  const checkpoints = tracking.checkpoints ?? [];
  const latest = checkpoints[checkpoints.length - 1];
  const locationParts: string[] = [];
  if (latest) {
    if (latest.message) locationParts.push(latest.message);
    const place = [latest.city, latest.state].filter(Boolean).join(', ');
    if (place) locationParts.push(place);
  }

  let summary = statusLabel;
  if (locationParts.length) summary += ` — ${locationParts.join(', ')}`;
  if (tracking.expected_delivery) {
    summary += `. Expected: ${formatExpectedDelivery(tracking.expected_delivery)}`;
  }
  return summary;
}

async function fetchStatus(trackingNumber: string, carrier: string | undefined, apiKey: string): Promise<PackageTrackingStatus | null> {
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

    const json = (await response.json()) as AftershippResponse;
    const tracking = json?.data?.tracking;
    if (!tracking) return null;

    return { summary: buildSummary(tracking) };
  } catch {
    return null;
  }
}

export type { PackageTrackingStatus };
export { fetchStatus, formatExpectedDelivery, resolveSlug, TAG_LABELS };
