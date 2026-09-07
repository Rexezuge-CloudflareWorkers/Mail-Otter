import { getBackendStrings } from '@mail-otter/shared/i18n';
import { LocaleUtil } from '@mail-otter/shared/utils';

const AVIATIONSTACK_API_BASE = 'https://api.aviationstack.com/v1/flights';


interface FlightSyncStatus {
  flightNumber: string;
  airline?: string;
  status?: string;
  departureTime?: string;
  departureIata?: string;
  arrivalIata?: string;
  lastUpdate?: string;
}

function formatFlightSummary(flightNumber: string, syncStatus: FlightSyncStatus, locale?: string | null): string {
  const status = syncStatus.status ?? 'Unknown';
  const statusLabel = statusLabelFor(status, locale);
  const strings = getBackendStrings(locale);
  let summary = `${strings.tracking.flightSummaryPrefix}${flightNumber} — ${statusLabel}`;
  if (syncStatus.departureTime) {
    const time = formatDepartureTime(syncStatus.departureTime, locale);
    if (time) summary += ` · ${strings.tracking.departsPrefix}${time}`;
  }
  return summary;
}

function statusLabelFor(status: string, locale?: string | null): string {
  const strings = getBackendStrings(locale);
  switch (status) {
    case 'scheduled': { return strings.tracking.flightScheduled; }
    case 'active': { return strings.tracking.flightActive; }
    case 'landed': { return strings.tracking.flightLanded; }
    case 'cancelled': { return strings.tracking.flightCancelled; }
    case 'incident': { return strings.tracking.flightIncident; }
    case 'diverted': { return strings.tracking.flightDiverted; }
    case 'Unknown': { return strings.tracking.flightUnknown; }
    default: { return STATUS_LABELS[status] ?? status; }
  }
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  active: 'In Flight',
  landed: 'Landed',
  cancelled: 'Cancelled',
  incident: 'Incident',
  diverted: 'Diverted',
};

function formatDepartureTime(iso: string, locale?: string | null): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(LocaleUtil.normalize(locale), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
}

async function fetchFlightStatus(flightNumber: string, apiKey: string): Promise<FlightSyncStatus | null> {
  try {
    const url = new URL(AVIATIONSTACK_API_BASE);
    url.searchParams.set('access_key', apiKey);
    url.searchParams.set('flight_iata', flightNumber);
    const response = await fetch(url.href);
    if (!response.ok) return null;
    const json = JSON.parse(await response.text()) as { data?: Record<string, any>[] };
    const flight = json?.data?.[0];
    if (!flight) return null;
    return {
      flightNumber,
      airline: flight.airline?.name,
      status: flight.flight_status,
      departureTime: flight.departure?.scheduled,
      departureIata: flight.departure?.iata,
      arrivalIata: flight.arrival?.iata,
    };
  } catch {
    return null;
  }
}

export type { FlightSyncStatus };
export { fetchFlightStatus, formatFlightSummary, formatDepartureTime, STATUS_LABELS };
