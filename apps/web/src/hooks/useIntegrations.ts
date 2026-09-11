import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IntegrationDeliveryLog, OutboundIntegration, OutboundIntegrationType } from '../types';
import type { UseMailboxesOptions } from './useApplications';
import * as appSvc from '../services/applicationService';

export function useIntegrations({ setIsBusy, showNotice }: UseMailboxesOptions) {
  const { t } = useTranslation();
  const [integrationsByApplicationId, setIntegrationsByApplicationId] = useState<Record<string, OutboundIntegration[]>>({});
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [deliveryLogsByIntegrationId, setDeliveryLogsByIntegrationId] = useState<Record<string, IntegrationDeliveryLog[]>>({});
  const [loadingDeliveryLogs, setLoadingDeliveryLogs] = useState(false);
  const [openDeliveryLogsIntegrationId, setOpenDeliveryLogsIntegrationId] = useState<string | null>(null);

  const loadIntegrations = async (applicationId: string) => {
    setLoadingIntegrations(true);
    try {
      const data = await appSvc.loadIntegrations(applicationId);
      setIntegrationsByApplicationId((c) => ({ ...c, [applicationId]: data.integrations }));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.integrationsLoadFailed', 'Unable To Load Integrations.'));
    } finally {
      setLoadingIntegrations(false);
    }
  };

  const createIntegration = async (
    applicationId: string,
    integrationType: OutboundIntegrationType,
    name: string,
    webhookUrl: string,
  ) => {
    setIsBusy(true);
    try {
      const data = await appSvc.createIntegration(applicationId, integrationType, name, webhookUrl);
      setIntegrationsByApplicationId((c) => ({
        ...c,
        [applicationId]: [...(c[applicationId] ?? []), data.integration],
      }));
      showNotice('success', t('toasts.integrationCreated', 'Integration Created.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.integrationCreateFailed', 'Unable To Create Integration.'));
    } finally {
      setIsBusy(false);
    }
  };

  const updateIntegration = async (
    integrationId: string,
    patch: { name?: string; enabled?: boolean; webhookUrl?: string },
  ) => {
    setIsBusy(true);
    try {
      const data = await appSvc.updateIntegration(integrationId, patch);
      setIntegrationsByApplicationId((c) => {
        const appId = data.integration.applicationId;
        return {
          ...c,
          [appId]: (c[appId] ?? []).map((i) => (i.integrationId === data.integration.integrationId ? data.integration : i)),
        };
      });
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.integrationUpdateFailed', 'Unable To Update Integration.'));
    } finally {
      setIsBusy(false);
    }
  };

  const deleteIntegration = async (integrationId: string, applicationId: string) => {
    setIsBusy(true);
    try {
      await appSvc.deleteIntegration(integrationId);
      setIntegrationsByApplicationId((c) => ({
        ...c,
        [applicationId]: (c[applicationId] ?? []).filter((i) => i.integrationId !== integrationId),
      }));
      showNotice('success', t('toasts.integrationDeleted', 'Integration Deleted.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.integrationDeleteFailed', 'Unable To Delete Integration.'));
    } finally {
      setIsBusy(false);
    }
  };

  const testIntegration = async (integrationId: string) => {
    setIsBusy(true);
    try {
      await appSvc.testIntegration(integrationId);
      showNotice('success', t('toasts.integrationTestSent', 'Test Notification Sent.'));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.integrationTestFailed', 'Unable To Send Test Notification.'));
    } finally {
      setIsBusy(false);
    }
  };

  const fetchDeliveryLogs = async (integrationId: string) => {
    setOpenDeliveryLogsIntegrationId(integrationId);
    setLoadingDeliveryLogs(true);
    try {
      const data = await appSvc.fetchIntegrationDeliveries(integrationId, 20);
      setDeliveryLogsByIntegrationId((c) => ({ ...c, [integrationId]: data.logs }));
    } catch (e) {
      showNotice('error', e instanceof Error ? e.message : t('toasts.deliveryHistoryFailed', 'Unable To Load Delivery History.'));
      setOpenDeliveryLogsIntegrationId(null);
    } finally {
      setLoadingDeliveryLogs(false);
    }
  };

  const closeDeliveryLogs = () => {
    setOpenDeliveryLogsIntegrationId(null);
  };

  return {
    integrationsByApplicationId,
    loadingIntegrations,
    loadIntegrations,
    createIntegration,
    updateIntegration,
    deleteIntegration: (integrationId: string, applicationId: string) => deleteIntegration(integrationId, applicationId),
    testIntegration,
    deliveryLogsByIntegrationId,
    loadingDeliveryLogs,
    openDeliveryLogsIntegrationId,
    fetchDeliveryLogs,
    closeDeliveryLogs,
  };
}
