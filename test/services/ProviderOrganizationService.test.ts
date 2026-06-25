import { beforeEach, describe, it, vi, expect } from 'vitest';

const { mockGetAccessToken, mockApplyLabel, mockArchiveMessage, mockMarkRead, mockStarMessage, mockRegistryGet } = vi.hoisted(() => ({
  mockGetAccessToken: vi.fn().mockResolvedValue('test-access-token'),
  mockApplyLabel: vi.fn().mockResolvedValue(undefined),
  mockArchiveMessage: vi.fn().mockResolvedValue(undefined),
  mockMarkRead: vi.fn().mockResolvedValue(undefined),
  mockStarMessage: vi.fn().mockResolvedValue(undefined),
  mockRegistryGet: vi.fn(),
}));

vi.mock('../../packages/backend-services/src/oauth2/OAuth2AccessTokenService', () => ({
  OAuth2AccessTokenService: vi.fn(function () {
    return { getAccessToken: mockGetAccessToken };
  }),
}));

vi.mock('../../packages/backend-services/src/provider/EmailProviderRegistry', () => ({
  EmailProviderRegistry: { get: mockRegistryGet },
}));

import { ProviderOrganizationService } from '../../packages/backend-services/src/email/ProviderOrganizationService';
import type { ConnectedApplication, EmailProcessingRule } from '@mail-otter/shared/model';

function makeApp(): ConnectedApplication {
  return {
    applicationId: 'app-1',
    providerId: 'google-gmail',
    connectionMethod: 'oauth2',
    userEmail: 'user@example.com',
    mailboxAddress: 'user@example.com',
    providerAccountId: 'account-1',
    enabled: true,
    enabledFeatures: [],
    createdAt: 0,
  };
}

function makeRule(action: EmailProcessingRule['action']): EmailProcessingRule {
  return {
    ruleId: 'rule-1',
    name: 'Test Rule',
    enabled: true,
    conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'test' }] },
    action,
  };
}

describe('ProviderOrganizationService', () => {
  const mockEnv = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('test-access-token');
    mockRegistryGet.mockReturnValue({
      providerId: 'google-gmail',
      applyLabel: mockApplyLabel,
      archiveMessage: mockArchiveMessage,
      markRead: mockMarkRead,
      starMessage: mockStarMessage,
    });
  });

  it('calls applyLabel for apply_label action', async () => {
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'apply_label', labelName: 'Work' })]);
    expect(mockApplyLabel).toHaveBeenCalledWith('test-access-token', 'msg-1', 'Work');
  });

  it('calls archiveMessage for archive_message action', async () => {
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'archive_message' })]);
    expect(mockArchiveMessage).toHaveBeenCalledWith('test-access-token', 'msg-1');
  });

  it('calls markRead for mark_read action', async () => {
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'mark_read' })]);
    expect(mockMarkRead).toHaveBeenCalledWith('test-access-token', 'msg-1');
  });

  it('calls starMessage for star_message action', async () => {
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'star_message' })]);
    expect(mockStarMessage).toHaveBeenCalledWith('test-access-token', 'msg-1');
  });

  it('handles empty rules array without calling any provider method', async () => {
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', []);
    expect(mockApplyLabel).not.toHaveBeenCalled();
    expect(mockArchiveMessage).not.toHaveBeenCalled();
  });

  it('logs warning when provider does not support applyLabel', async () => {
    mockRegistryGet.mockReturnValue({ providerId: 'google-gmail' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'apply_label', labelName: 'Work' })]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs warning when provider does not support archiveMessage', async () => {
    mockRegistryGet.mockReturnValue({ providerId: 'google-gmail' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'archive_message' })]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs warning when provider does not support markRead', async () => {
    mockRegistryGet.mockReturnValue({ providerId: 'google-gmail' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'mark_read' })]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs warning when provider does not support starMessage', async () => {
    mockRegistryGet.mockReturnValue({ providerId: 'google-gmail' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [makeRule({ type: 'star_message' })]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('continues executing other rules when one fails', async () => {
    mockApplyLabel.mockRejectedValueOnce(new Error('API error'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new ProviderOrganizationService(mockEnv);
    await service.executePostProcessingRules(makeApp(), 'msg-1', [
      makeRule({ type: 'apply_label', labelName: 'Work' }),
      makeRule({ type: 'mark_read' }),
    ]);
    expect(mockMarkRead).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
