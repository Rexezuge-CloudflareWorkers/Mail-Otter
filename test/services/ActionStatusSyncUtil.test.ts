import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListPendingActionsByTypes,
  mockUpdateSyncStatus,
  mockFetchFlightStatus,
} = vi.hoisted(() => ({
  mockListPendingActionsByTypes: vi.fn().mockResolvedValue([]),
  mockUpdateSyncStatus: vi.fn().mockResolvedValue(undefined),
  mockFetchFlightStatus: vi.fn(),
}));

vi.mock('@mail-otter/backend-data/dao', () => ({
  EmailActionDAO: vi.fn(function () {
    return {
      listPendingActionsByTypes: mockListPendingActionsByTypes,
      updateSyncStatus: mockUpdateSyncStatus,
    };
  }),
}));

vi.mock('../../packages/backend-services/src/action/FlightTrackingService', () => ({
  fetchFlightStatus: mockFetchFlightStatus,
}));

import { ActionStatusSyncUtil } from '../../packages/backend-services/src/digest/ActionStatusSyncUtil';

function makePackageAction(overrides?: Record<string, unknown>) {
  return {
    actionId: 'action-pkg-1',
    actionType: 'delivery.track_package',
    title: 'Track Package',
    description: 'Your package is shipping',
    status: 'pending',
    payload: {
      trackingNumber: 'TRK123456',
      carrier: 'UPS',
    },
    syncStatus: null,
    ...overrides,
  };
}

function makeFlightAction(overrides?: Record<string, unknown>) {
  return {
    actionId: 'action-flt-1',
    actionType: 'travel.track_flight',
    title: 'Track Flight',
    description: 'Your flight is AA100',
    status: 'pending',
    payload: {
      flightNumber: 'AA100',
    },
    syncStatus: null,
    ...overrides,
  };
}

function makeAftershipResponse(trackings: Array<Record<string, unknown>>) {
  return JSON.stringify({ data: { trackings } });
}

describe('ActionStatusSyncUtil', () => {
  let util: ActionStatusSyncUtil;

  beforeEach(() => {
    vi.clearAllMocks();
    util = new ActionStatusSyncUtil({} as D1Database, 'action-key');
  });

  describe('syncPackageActions', () => {
    it('does nothing when no pending package actions', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([]);

      await util.syncPackageActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).not.toHaveBeenCalled();
    });

    it('fetches tracking and updates sync status on success', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makePackageAction()]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(
          makeAftershipResponse([
            {
              tag: 'InTransit',
              expected_delivery: '2026-06-28',
              checkpoints: [{ city: 'Los Angeles', state: 'CA', message: 'Arrived at hub' }],
            },
          ]),
        ),
      });

      await util.syncPackageActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).toHaveBeenCalledOnce();
      const [actionId, syncStatusJson] = mockUpdateSyncStatus.mock.calls[0];
      expect(actionId).toBe('action-pkg-1');
      const syncStatus = JSON.parse(syncStatusJson as string);
      expect(syncStatus.status).toBe('InTransit');
      expect(syncStatus.location).toBe('Los Angeles, CA');
      expect(syncStatus.lastUpdate).toBe('Arrived at hub');
      expect(syncStatus.carrier).toBe('UPS');
      expect(syncStatus.trackingNumber).toBe('TRK123456');
    });

    it('skips update when Aftership returns no trackings', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makePackageAction()]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(makeAftershipResponse([])),
      });

      await util.syncPackageActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).not.toHaveBeenCalled();
    });

    it('skips update when API returns non-OK status', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makePackageAction()]);
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 });

      await util.syncPackageActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).not.toHaveBeenCalled();
    });

    it('skips action when tracking number is missing', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([
        makePackageAction({ payload: { carrier: 'FedEx' } }),
      ]);

      await util.syncPackageActions('app-1', 'api-key');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockUpdateSyncStatus).not.toHaveBeenCalled();
    });

    it('continues processing remaining actions when one fetch throws', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([
        makePackageAction({ actionId: 'action-fail', payload: { trackingNumber: 'BAD1' } }),
        makePackageAction({ actionId: 'action-ok', payload: { trackingNumber: 'GOOD2' } }),
      ]);
      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue(
            makeAftershipResponse([{ tag: 'Delivered', checkpoints: [] }]),
          ),
        });

      await util.syncPackageActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).toHaveBeenCalledOnce();
      expect(mockUpdateSyncStatus.mock.calls[0][0]).toBe('action-ok');
    });

    it('handles checkpoint with no city/state gracefully', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makePackageAction()]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(
          makeAftershipResponse([
            {
              tag: 'Delivered',
              checkpoints: [{ message: 'Package delivered' }],
            },
          ]),
        ),
      });

      await util.syncPackageActions('app-1', 'api-key');

      const syncStatus = JSON.parse(mockUpdateSyncStatus.mock.calls[0][1] as string);
      expect(syncStatus.location).toBeUndefined();
    });

    it('handles expected_delivery absent gracefully', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makePackageAction()]);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue(
          makeAftershipResponse([
            { tag: 'Pending', checkpoints: [] },
          ]),
        ),
      });

      await util.syncPackageActions('app-1', 'api-key');

      const syncStatus = JSON.parse(mockUpdateSyncStatus.mock.calls[0][1] as string);
      expect(syncStatus.expectedDelivery).toBeUndefined();
    });
  });

  describe('syncFlightActions', () => {
    it('does nothing when no pending flight actions', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([]);

      await util.syncFlightActions('app-1', 'api-key');

      expect(mockFetchFlightStatus).not.toHaveBeenCalled();
    });

    it('updates sync status when flight status fetched', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makeFlightAction()]);
      const flightStatus = { status: 'On Time', departureDelay: 0, arrivalDelay: 0 };
      mockFetchFlightStatus.mockResolvedValue(flightStatus);

      await util.syncFlightActions('app-1', 'api-key');

      expect(mockFetchFlightStatus).toHaveBeenCalledWith('AA100', 'api-key');
      expect(mockUpdateSyncStatus).toHaveBeenCalledOnce();
      const syncJson = JSON.parse(mockUpdateSyncStatus.mock.calls[0][1] as string);
      expect(syncJson.status).toBe('On Time');
    });

    it('skips update when flight status returns null', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([makeFlightAction()]);
      mockFetchFlightStatus.mockResolvedValue(null);

      await util.syncFlightActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).not.toHaveBeenCalled();
    });

    it('skips action when flight number is missing', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([
        makeFlightAction({ payload: {} }),
      ]);

      await util.syncFlightActions('app-1', 'api-key');

      expect(mockFetchFlightStatus).not.toHaveBeenCalled();
    });

    it('continues processing remaining actions when one throws', async () => {
      mockListPendingActionsByTypes.mockResolvedValue([
        makeFlightAction({ actionId: 'flt-1', payload: { flightNumber: 'BAD1' } }),
        makeFlightAction({ actionId: 'flt-2', payload: { flightNumber: 'GOOD2' } }),
      ]);
      mockFetchFlightStatus
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ status: 'Delayed', departureDelay: 30 });

      await util.syncFlightActions('app-1', 'api-key');

      expect(mockUpdateSyncStatus).toHaveBeenCalledOnce();
      expect(mockUpdateSyncStatus.mock.calls[0][0]).toBe('flt-2');
    });
  });
});
