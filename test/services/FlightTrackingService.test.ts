import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFlightStatus, formatFlightSummary, formatDepartureTime, STATUS_LABELS } from '../../packages/backend-services/src/action/FlightTrackingService';

const API_KEY = 'test-aviationstack-key';
const FLIGHT_NUMBER = 'AA123';

function makeFlightResponse(overrides?: Record<string, unknown>) {
  return {
    data: [
      {
        flight_status: 'scheduled',
        departure: { scheduled: '2026-07-01T14:30:00+00:00', iata: 'JFK' },
        arrival: { iata: 'LAX' },
        airline: { name: 'American Airlines' },
        flight: { iata: 'AA123' },
        ...overrides,
      },
    ],
  };
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(body, { status }),
  );
}

describe('FlightTrackingService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('fetchFlightStatus', () => {
    it('returns parsed FlightSyncStatus for a scheduled flight', async () => {
      mockFetch(200, makeFlightResponse());

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).not.toBeNull();
      expect(result!.flightNumber).toBe('AA123');
      expect(result!.status).toBe('scheduled');
      expect(result!.airline).toBe('American Airlines');
      expect(result!.departureIata).toBe('JFK');
      expect(result!.arrivalIata).toBe('LAX');
      expect(result!.departureTime).toBe('2026-07-01T14:30:00+00:00');
    });

    it('includes flight_iata and access_key in request URL', async () => {
      const spy = mockFetch(200, makeFlightResponse());

      await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      const url = new URL((spy.mock.calls[0][0] as string));
      expect(url.searchParams.get('flight_iata')).toBe('AA123');
      expect(url.searchParams.get('access_key')).toBe(API_KEY);
    });

    it('returns null when data array is empty', async () => {
      mockFetch(200, { data: [] });

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null when data field is missing', async () => {
      mockFetch(200, {});

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null for non-200 HTTP status', async () => {
      mockFetch(401, { error: { code: 101, message: 'Invalid API key' } });

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null for 500 server error', async () => {
      mockFetch(500, {});

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).toBeNull();
    });

    it('handles missing optional fields gracefully', async () => {
      mockFetch(200, { data: [{ flight_status: 'active' }] });

      const result = await fetchFlightStatus(FLIGHT_NUMBER, API_KEY);

      expect(result).not.toBeNull();
      expect(result!.flightNumber).toBe('AA123');
      expect(result!.status).toBe('active');
      expect(result!.airline).toBeUndefined();
      expect(result!.departureIata).toBeUndefined();
      expect(result!.arrivalIata).toBeUndefined();
      expect(result!.departureTime).toBeUndefined();
    });
  });

  describe('formatFlightSummary', () => {
    it('formats a scheduled flight with departure time', () => {
      const syncStatus = {
        flightNumber: 'AA123',
        status: 'scheduled',
        departureTime: '2026-07-01T14:30:00+00:00',
      };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).toContain('Flight AA123');
      expect(summary).toContain('Scheduled');
      expect(summary).toContain('14:30 UTC');
    });

    it('formats an active (in-flight) status', () => {
      const syncStatus = { flightNumber: 'AA123', status: 'active' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).toContain('In Flight');
    });

    it('formats a landed status', () => {
      const syncStatus = { flightNumber: 'AA123', status: 'landed' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).toContain('Landed');
    });

    it('formats a cancelled status', () => {
      const syncStatus = { flightNumber: 'AA123', status: 'cancelled' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).toContain('Cancelled');
    });

    it('uses raw status value when not in STATUS_LABELS', () => {
      const syncStatus = { flightNumber: 'AA123', status: 'unknown_state' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).toContain('unknown_state');
    });

    it('omits departure time when departureTime is absent', () => {
      const syncStatus = { flightNumber: 'AA123', status: 'scheduled' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).not.toContain('Departs');
    });

    it('omits departure time when departureTime is an invalid date', () => {
      const syncStatus = { flightNumber: 'AA123', status: 'scheduled', departureTime: 'not-a-date' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).not.toContain('Departs');
    });

    it('falls back to Unknown when status is undefined', () => {
      const syncStatus = { flightNumber: 'AA123' };

      const summary = formatFlightSummary('AA123', syncStatus);

      expect(summary).toContain('Unknown');
    });
  });

  describe('formatDepartureTime', () => {
    it('formats ISO timestamp as HH:MM UTC', () => {
      expect(formatDepartureTime('2026-07-01T14:30:00+00:00')).toBe('14:30 UTC');
    });

    it('returns null for invalid date string', () => {
      expect(formatDepartureTime('not-a-date')).toBeNull();
    });
  });

  describe('STATUS_LABELS', () => {
    it('has a label for each known status', () => {
      expect(STATUS_LABELS['scheduled']).toBe('Scheduled');
      expect(STATUS_LABELS['active']).toBe('In Flight');
      expect(STATUS_LABELS['landed']).toBe('Landed');
      expect(STATUS_LABELS['cancelled']).toBe('Cancelled');
      expect(STATUS_LABELS['incident']).toBe('Incident');
      expect(STATUS_LABELS['diverted']).toBe('Diverted');
    });
  });
});
