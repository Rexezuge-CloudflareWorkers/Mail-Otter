import { EmailActionDAO } from '@mail-otter/backend-data/dao';
import {
  EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE,
  EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT,
} from '@mail-otter/shared/constants';
import type { DeliveryTrackPackageActionPayload, EmailAction, TravelTrackFlightActionPayload } from '@mail-otter/shared/model';
import type { D1Queryable } from '@mail-otter/backend-data/utils';
import { formatExpectedDelivery, TAG_LABELS } from '../action/PackageTrackingService';

interface PackageSyncStatus {
  carrier?: string;
  trackingNumber: string;
  status?: string;
  statusLabel?: string;
  location?: string;
  expectedDelivery?: string;
  lastUpdate?: string;
}

interface FlightSyncStatus {
  flightNumber: string;
  airline?: string;
  status?: string;
  departureTime?: string;
  lastUpdate?: string;
}

class ActionStatusSyncUtil {
  private readonly actionDAO: EmailActionDAO;

  constructor(db: D1Queryable, actionKey: string) {
    this.actionDAO = new EmailActionDAO(db, actionKey);
  }

  public async syncPackageActions(applicationId: string, packageTrackingApiKey: string): Promise<void> {
    const actions = await this.actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_DELIVERY_TRACK_PACKAGE]);
    for (const action of actions) {
      try {
        await this.syncPackageAction(action, packageTrackingApiKey);
      } catch (error: unknown) {
        console.error(`[ActionStatusSyncUtil] Failed to sync package action ${action.actionId}:`, error);
      }
    }
  }

  public async syncFlightActions(applicationId: string, flightTrackingApiKey: string): Promise<void> {
    const actions = await this.actionDAO.listPendingActionsByTypes(applicationId, [EMAIL_ACTION_TYPE_TRAVEL_TRACK_FLIGHT]);
    for (const action of actions) {
      try {
        await this.syncFlightAction(action, flightTrackingApiKey);
      } catch (error: unknown) {
        console.error(`[ActionStatusSyncUtil] Failed to sync flight action ${action.actionId}:`, error);
      }
    }
  }

  private async syncPackageAction(action: EmailAction, apiKey: string): Promise<void> {
    const payload = action.payload as DeliveryTrackPackageActionPayload;
    if (!payload.trackingNumber || !apiKey) return;

    const url = new URL('https://api.aftership.com/tracking/2024-10/trackings');
    url.searchParams.set('tracking_numbers', payload.trackingNumber);
    const response = await fetch(url.toString(), {
      headers: { 'as-api-key': apiKey, 'Content-Type': 'application/json' },
    });
    if (!response.ok) return;

    const data = (await response.json()) as {
      data?: {
        trackings?: Array<{
          tag?: string;
          expected_delivery?: string;
          checkpoints?: Array<{ message?: string; city?: string; state?: string; created_at?: string }>;
        }>;
      };
    };
    const tracking = data.data?.trackings?.[0];
    if (!tracking) return;

    const latestCheckpoint = tracking.checkpoints?.[0];
    const location = [latestCheckpoint?.city, latestCheckpoint?.state].filter(Boolean).join(', ') || undefined;
    const syncStatus: PackageSyncStatus = {
      carrier: payload.carrier,
      trackingNumber: payload.trackingNumber,
      status: tracking.tag,
      statusLabel: tracking.tag ? (TAG_LABELS[tracking.tag] ?? tracking.tag) : undefined,
      location,
      expectedDelivery: tracking.expected_delivery ? formatExpectedDelivery(tracking.expected_delivery) : undefined,
      lastUpdate: latestCheckpoint?.message,
    };
    await this.actionDAO.updateSyncStatus(action.actionId, JSON.stringify(syncStatus));
  }

  private async syncFlightAction(action: EmailAction, apiKey: string): Promise<void> {
    const payload = action.payload as TravelTrackFlightActionPayload;
    if (!payload.flightNumber || !apiKey) return;

    const url = new URL('http://api.aviationstack.com/v1/flights');
    url.searchParams.set('access_key', apiKey);
    url.searchParams.set('flight_iata', payload.flightNumber);
    const response = await fetch(url.toString());
    if (!response.ok) return;

    const data = (await response.json()) as {
      data?: Array<{ flight_status?: string; departure?: { scheduled?: string } }>;
    };
    const flight = data.data?.[0];
    if (!flight) return;

    const syncStatus: FlightSyncStatus = {
      flightNumber: payload.flightNumber,
      airline: payload.airline,
      status: flight.flight_status,
      departureTime: flight.departure?.scheduled,
    };
    await this.actionDAO.updateSyncStatus(action.actionId, JSON.stringify(syncStatus));
  }
}

export { ActionStatusSyncUtil };
export type { PackageSyncStatus, FlightSyncStatus };
