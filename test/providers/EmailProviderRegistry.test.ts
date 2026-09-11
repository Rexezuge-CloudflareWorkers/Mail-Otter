import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@mail-otter/backend-errors';
import {
  EmailProviderRegistry,
  createEmailProviderRegistry,
  getEmailProviderRegistryKey,
  resolveEmailProvider,
} from '@mail-otter/backend-services/provider';
import type { IEmailProvider } from '@mail-otter/backend-services/provider';

function stubProvider(providerId: string): IEmailProvider {
  return { providerId } as unknown as IEmailProvider;
}

describe('EmailProviderRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('get', () => {
    it('returns the OAuth2 provider for a known provider id', () => {
      expect(EmailProviderRegistry.get('google-gmail').providerId).toBe('google-gmail');
      expect(EmailProviderRegistry.get('microsoft-outlook').providerId).toBe('microsoft-outlook');
      expect(EmailProviderRegistry.get('fastmail-jmap').providerId).toBe('fastmail-jmap');
    });

    it('returns the IMAP variant when the imap-password connection method is requested', () => {
      const provider = EmailProviderRegistry.get('google-gmail', 'imap-password');
      expect(provider.providerId).toBe('google-gmail');
      expect(provider).not.toBe(EmailProviderRegistry.get('google-gmail'));
    });

    it('falls back to the base provider for unknown connection methods', () => {
      expect(EmailProviderRegistry.get('google-gmail', 'oauth2')).toBe(EmailProviderRegistry.get('google-gmail'));
    });

    it('throws BadRequestError for unsupported providers', () => {
      expect(() => EmailProviderRegistry.get('proton-mail')).toThrow(BadRequestError);
      expect(() => EmailProviderRegistry.get('proton-mail')).toThrow('Unsupported provider: proton-mail');
    });

    it('throws BadRequestError for empty provider ids', () => {
      expect(() => EmailProviderRegistry.get('')).toThrow(BadRequestError);
    });
  });

  describe('getAll', () => {
    it('exposes all nine wired providers', () => {
      const all = EmailProviderRegistry.getAll();
      expect(all.size).toBe(9);
      expect([...all.keys()].sort()).toEqual(
        [
          'apple-icloud',
          'custom-imap',
          'fastmail-jmap',
          'fastmail-jmap:imap-password',
          'google-gmail',
          'google-gmail:imap-password',
          'microsoft-outlook',
          'microsoft-outlook:imap-password',
          'yahoo-mail',
        ].sort(),
      );
    });

    it('returns consistent instances across calls', () => {
      expect(EmailProviderRegistry.getAll()).toBe(EmailProviderRegistry.getAll());
      expect(EmailProviderRegistry.get('yahoo-mail')).toBe(EmailProviderRegistry.getAll().get('yahoo-mail'));
    });
  });

  describe('getEmailProviderRegistryKey', () => {
    it('returns the bare provider id without a connection method', () => {
      expect(getEmailProviderRegistryKey('google-gmail')).toBe('google-gmail');
    });

    it('suffixes the connection method when provided', () => {
      expect(getEmailProviderRegistryKey('google-gmail', 'imap-password')).toBe('google-gmail:imap-password');
    });
  });

  describe('resolveEmailProvider', () => {
    it('resolves method-specific entries first', () => {
      const registry = new Map<string, IEmailProvider>([
        ['google-gmail', stubProvider('base')],
        ['google-gmail:imap-password', stubProvider('imap')],
      ]);

      expect(resolveEmailProvider(registry, 'google-gmail', 'imap-password').providerId).toBe('imap');
      expect(resolveEmailProvider(registry, 'google-gmail').providerId).toBe('base');
    });

    it('throws for unknown providers', () => {
      expect(() => resolveEmailProvider(new Map(), 'unknown')).toThrow('Unsupported provider: unknown');
    });
  });

  describe('createEmailProviderRegistry', () => {
    it('starts from the wired providers', () => {
      const registry = createEmailProviderRegistry();
      expect(registry.size).toBe(EmailProviderRegistry.getAll().size);
    });

    it('applies record overrides without mutating the shared registry', () => {
      const override = stubProvider('override');
      const registry = createEmailProviderRegistry({ 'google-gmail': override });

      expect(registry.get('google-gmail')).toBe(override);
      expect(EmailProviderRegistry.get('google-gmail')).not.toBe(override);
    });
  });
});
