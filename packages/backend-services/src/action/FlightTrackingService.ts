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

function formatFlightSummary(flightNumber: string, syncStatus: FlightSyncStatus): string {
  const status = syncStatus.status ?? 'Unknown';
  const statusLabel = STATUS_LABELS[status] ?? status;
  let summary = `Flight ${flightNumber} — ${statusLabel}`;
  if (syncStatus.departureTime) {
    const time = formatDepartureTime(syncStatus.departureTime);
    if (time) summary += ` · Departs ${time}`;
  }
  return summary;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  active: 'In Flight',
  landed: 'Landed',
  cancelled: 'Cancelled',
  incident: 'Incident',
  diverted: 'Diverted',
};

function formatDepartureTime(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
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
