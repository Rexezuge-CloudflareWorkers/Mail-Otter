import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gmailFindOrCreateLabel: vi.fn(),
  gmailModifyMessage: vi.fn(),
  gmailListLabels: vi.fn(),
  outlookUpdateMessageProperties: vi.fn(),
  outlookListCategories: vi.fn(),
}));

vi.mock('@mail-otter/provider-clients/gmail', () => ({
  GmailProviderUtil: {
    findOrCreateLabel: mocks.gmailFindOrCreateLabel,
    modifyMessage: mocks.gmailModifyMessage,
    listLabels: mocks.gmailListLabels,
  },
}));

vi.mock('@mail-otter/provider-clients/outlook', () => ({
  OutlookProviderUtil: {
    updateMessageProperties: mocks.outlookUpdateMessageProperties,
    listOutlookCategories: mocks.outlookListCategories,
  },
}));

import { EmailProviderRegistry } from '@mail-otter/backend-services/provider';
import type { IEmailProvider, ILabelProvider } from '@mail-otter/backend-services/provider';

const LABEL_METHODS = ['applyLabel', 'archiveMessage', 'markRead', 'starMessage', 'listLabels'] as const;

function asLabelProvider(provider: IEmailProvider): ILabelProvider | undefined {
  const candidate = provider as Partial<ILabelProvider>;
  return typeof candidate.applyLabel === 'function' && typeof candidate.listLabels === 'function'
    ? (candidate as ILabelProvider)
    : undefined;
}

describe('LabelProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('capability matrix', () => {
    it('exposes the label contract on Gmail and Outlook providers', () => {
      for (const key of ['google-gmail', 'microsoft-outlook']) {
        const provider = EmailProviderRegistry.getAll().get(key);
        expect(provider).toBeDefined();
        for (const method of LABEL_METHODS) {
          expect(typeof (provider as Record<string, unknown>)[method], `${key}.${method}`).toBe('function');
        }
      }
    });

    it('keeps label support consistent: providers without applyLabel also lack listLabels', () => {
      for (const [key, provider] of EmailProviderRegistry.getAll()) {
        const candidate = provider as Partial<ILabelProvider>;
        if (typeof candidate.applyLabel !== 'function') {
          expect(typeof candidate.listLabels, `${key}.listLabels`).not.toBe('function');
        }
      }
    });

    it('resolves at least one label-capable provider from the registry', () => {
      const capable = [...EmailProviderRegistry.getAll().values()].filter((p) => asLabelProvider(p) !== undefined);
      expect(capable.length).toBeGreaterThan(0);
    });
  });

  describe('Gmail label provider', () => {
    it('applies a label by resolving the label id then modifying the message', async () => {
      mocks.gmailFindOrCreateLabel.mockResolvedValue('Label_42');
      mocks.gmailModifyMessage.mockResolvedValue(undefined);
      const provider = asLabelProvider(EmailProviderRegistry.get('google-gmail'));

      await provider?.applyLabel('token', 'msg-1', 'Shopping');

      expect(mocks.gmailFindOrCreateLabel).toHaveBeenCalledWith('token', 'Shopping');
      expect(mocks.gmailModifyMessage).toHaveBeenCalledWith('token', 'msg-1', ['Label_42'], []);
    });

    it('lists labels as id/name pairs', async () => {
      mocks.gmailListLabels.mockResolvedValue([{ id: 'INBOX', name: 'INBOX' }]);
      const provider = asLabelProvider(EmailProviderRegistry.get('google-gmail'));

      await expect(provider?.listLabels('token')).resolves.toEqual([{ id: 'INBOX', name: 'INBOX' }]);
      expect(mocks.gmailListLabels).toHaveBeenCalledWith('token');
    });

    it('propagates label API failures', async () => {
      mocks.gmailFindOrCreateLabel.mockRejectedValue(new Error('Gmail API down'));
      const provider = asLabelProvider(EmailProviderRegistry.get('google-gmail'));

      await expect(provider?.applyLabel('token', 'msg-1', 'Shopping')).rejects.toThrow('Gmail API down');
    });
  });

  describe('Outlook label provider', () => {
    it('applies a label via message categories', async () => {
      mocks.outlookUpdateMessageProperties.mockResolvedValue(undefined);
      const provider = asLabelProvider(EmailProviderRegistry.get('microsoft-outlook'));

      await provider?.applyLabel('token', 'msg-1', 'Shopping');

      expect(mocks.outlookUpdateMessageProperties).toHaveBeenCalledWith('token', 'msg-1', { categories: ['Shopping'] });
    });

    it('lists Outlook categories as id/name pairs', async () => {
      mocks.outlookListCategories.mockResolvedValue([{ id: 'cat-1', displayName: 'Shopping' }]);
      const provider = asLabelProvider(EmailProviderRegistry.get('microsoft-outlook'));

      await expect(provider?.listLabels('token')).resolves.toEqual([{ id: 'cat-1', name: 'Shopping' }]);
    });
  });
});
