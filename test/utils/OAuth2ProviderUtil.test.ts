import { describe, expect, it } from 'vitest';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-otter/shared/constants';
import { OAuth2ProviderUtil } from '@/utils';

describe('OAuth2ProviderUtil', () => {
  it('builds a Google authorization URL with offline access and PKCE', () => {
    const url = new URL(
      OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: PROVIDER_GOOGLE_GMAIL,
        clientId: 'client-id',
        redirectUri: 'https://mail.example.com/api/oauth2/callback/app-id',
        state: 'state-value',
        codeChallenge: 'challenge-value',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe('https://mail.example.com/api/oauth2/callback/app-id');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('gmail.readonly');
    expect(url.searchParams.get('scope')).toContain('gmail.send');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('builds a Microsoft Outlook authorization URL with response_mode=query', () => {
    const url = new URL(
      OAuth2ProviderUtil.buildAuthorizationUrl({
        providerId: PROVIDER_MICROSOFT_OUTLOOK,
        clientId: 'client-id',
        redirectUri: 'https://mail.example.com/api/oauth2/callback/app-id',
        state: 'state-value',
        codeChallenge: 'challenge-value',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize');
    expect(url.searchParams.get('response_mode')).toBe('query');
    expect(url.searchParams.get('scope')).toContain('Mail.Read');
    expect(url.searchParams.get('scope')).toContain('Mail.ReadWrite');
    expect(url.searchParams.get('scope')).toContain('Mail.Send');
    expect(url.searchParams.get('scope')).toContain('offline_access');
  });
});
