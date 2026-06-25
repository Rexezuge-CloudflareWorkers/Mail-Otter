import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStatus, resolveSlug } from '@mail-otter/backend-services/action/PackageTrackingService';

const API_KEY = 'test-aftership-key';

function makeCheckpoint(overrides?: Record<string, unknown>) {
  return { message: 'In transit', city: 'Louisville', state: 'KY', created_at: '2026-06-24T08:00:00Z', ...overrides };
}

function makeTrackingResponse(overrides?: Record<string, unknown>) {
  return {
    data: {
      tracking: {
        tag: 'InTransit',
        expected_delivery: '2026-06-26T00:00:00Z',
        checkpoints: [makeCheckpoint()],
        ...overrides,
      },
    },
  };
}

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json(body, { status }),
  );
}

describe('PackageTrackingService', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('resolveSlug', () => {
    it('maps UPS to ups (case-insensitive)', () => expect(resolveSlug('UPS')).toBe('ups'));
    it('maps FedEx Express to fedex', () => expect(resolveSlug('FedEx Express')).toBe('fedex'));
    it('maps USPS to usps', () => expect(resolveSlug('USPS')).toBe('usps'));
    it('maps DHL to dhl', () => expect(resolveSlug('DHL Express')).toBe('dhl'));
    it('maps Amazon Logistics to amazon', () => expect(resolveSlug('Amazon Logistics')).toBe('amazon'));
    it('maps OnTrac to ontrac', () => expect(resolveSlug('OnTrac')).toBe('ontrac'));
    it('maps LaserShip to lasership', () => expect(resolveSlug('LaserShip')).toBe('lasership'));
    it('maps LSO to lasership', () => expect(resolveSlug('LSO')).toBe('lasership'));
    it('returns undefined for unrecognized carrier', () => expect(resolveSlug('SpeedyShip')).toBeUndefined());
    it('returns undefined for undefined carrier', () => expect(resolveSlug(undefined)).toBeUndefined());
  });

  describe('fetchStatus', () => {
    it('returns formatted summary for InTransit with location and expected delivery', async () => {
      mockFetch(201, makeTrackingResponse());

      const result = await fetchStatus('1Z999AA10123456784', 'UPS', API_KEY);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('In Transit');
      expect(result!.summary).toContain('In transit');
      expect(result!.summary).toContain('Louisville');
      expect(result!.summary).toContain('Expected:');
    });

    it('returns Delivered label for Delivered tag', async () => {
      mockFetch(201, makeTrackingResponse({ tag: 'Delivered', checkpoints: [makeCheckpoint({ message: 'Delivered' })], expected_delivery: undefined }));

      const result = await fetchStatus('1Z999', 'UPS', API_KEY);

      expect(result!.summary).toMatch(/^Delivered/);
    });

    it('returns Out For Delivery label for OutForDelivery tag', async () => {
      mockFetch(201, makeTrackingResponse({ tag: 'OutForDelivery', expected_delivery: undefined }));

      const result = await fetchStatus('1Z999', undefined, API_KEY);

      expect(result!.summary).toContain('Out For Delivery');
    });

    it('handles 409 Already Exists by returning tracking data from the body', async () => {
      mockFetch(409, makeTrackingResponse({ tag: 'InTransit' }));

      const result = await fetchStatus('1Z999', 'UPS', API_KEY);

      expect(result).not.toBeNull();
      expect(result!.summary).toContain('In Transit');
    });

    it('returns null for unexpected HTTP status', async () => {
      mockFetch(400, { meta: { code: 400, message: 'Bad Request' } });

      const result = await fetchStatus('1Z999', 'UPS', API_KEY);

      expect(result).toBeNull();
    });

    it('returns null for 500 server error', async () => {
      mockFetch(500, {});

      const result = await fetchStatus('1Z999', 'UPS', API_KEY);

      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await fetchStatus('1Z999', 'UPS', API_KEY);

      expect(result).toBeNull();
    });

    it('returns null when tracking data is missing from response body', async () => {
      mockFetch(201, { data: {} });

      const result = await fetchStatus('1Z999', 'UPS', API_KEY);

      expect(result).toBeNull();
    });

    it('builds summary without location when checkpoints are empty', async () => {
      mockFetch(201, makeTrackingResponse({ checkpoints: [], expected_delivery: undefined }));

      const result = await fetchStatus('1Z999', undefined, API_KEY);

      expect(result!.summary).toBe('In Transit');
    });

    it('sends no slug when carrier is unrecognized', async () => {
      const spy = mockFetch(201, makeTrackingResponse());

      await fetchStatus('1Z999', 'SpeedyShip', API_KEY);

      const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.tracking.slug).toBeUndefined();
      expect(body.tracking.tracking_number).toBe('1Z999');
    });

    it('sends slug when carrier is recognized', async () => {
      const spy = mockFetch(201, makeTrackingResponse());

      await fetchStatus('1Z999', 'FedEx', API_KEY);

      const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.tracking.slug).toBe('fedex');
    });

    it('sends as-api-key header', async () => {
      const spy = mockFetch(201, makeTrackingResponse());

      await fetchStatus('1Z999', 'UPS', API_KEY);

      const headers = spy.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['as-api-key']).toBe(API_KEY);
    });
  });
});
