import { describe, expect, it } from 'vitest';
import { formatBackendString, getBackendStrings } from '@mail-otter/shared/i18n';
import { renderConfirmationPage, renderMessagePage } from '../../packages/backend-services/src/action/ActionRenderService';

describe('getBackendStrings', () => {
  it('returns English strings by default', () => {
    expect(getBackendStrings(null).digest.empty).toContain('Nothing to report today.');
    expect(getBackendStrings('xx').actionPage.confirmButton).toBe('Confirm action');
  });

  it('returns localized strings for supported locales', () => {
    expect(getBackendStrings('de').digest.empty).not.toContain('Nothing to report today.');
    expect(getBackendStrings('ja').actionPage.confirmButton).not.toBe('Confirm action');
    expect(getBackendStrings('zh-TW').actionPage.confirmButton).not.toBe('Confirm action');
  });

  it('normalizes variant tags before lookup', () => {
    expect(getBackendStrings('zh-cn').digest.title).toBe(getBackendStrings('zh-CN').digest.title);
    expect(getBackendStrings('pt-BR').actionPage.confirmButton).toBe(getBackendStrings('pt').actionPage.confirmButton);
  });
});

describe('formatBackendString', () => {
  it('replaces placeholders with provided values', () => {
    expect(formatBackendString('Expected: {value}', { value: 'Monday' })).toBe('Expected: Monday');
    expect(formatBackendString('Attempt {n}', { n: 3 })).toBe('Attempt 3');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(formatBackendString('Hello {name}', {})).toBe('Hello {name}');
  });
});

describe('ActionRenderService localization', () => {
  it('renders the not-found page with a localized lang attribute', () => {
    const html = renderMessagePage('Titel', 'Nachricht', 'de');
    expect(html).toContain('<html lang="de">');
  });

  it('renders the confirmation page shell in the requested locale', () => {
    const action = {
      actionId: 'action-1',
      applicationId: 'app-1',
      userEmail: 'user@example.com',
      providerId: 'google-gmail',
      providerMessageId: 'msg-1',
      actionType: 'manual.todo',
      status: 'pending',
      riskLevel: 'low',
      title: 'Buy milk',
      description: 'Pick up milk on the way home.',
      payload: { type: 'manual.todo', title: 'Buy milk', description: 'Pick up milk.', instructions: 'Buy milk' },
      expiresAt: 1_998_200_000,
      createdAt: 1_778_200_000,
      updatedAt: 1_778_200_000,
    } as never;
    const html = renderConfirmationPage(action, 'token', 'fr');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('Confirmer');
  });
});
