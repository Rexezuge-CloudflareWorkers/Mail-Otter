import { describe, expect, it } from 'vitest';
import { getRequestInputSchema, validateRequestInput } from '../../packages/shared/src/schema';

describe('Request input schemas', () => {
  it('finds schemas for provider webhook routes', () => {
    const gmailRequest = new Request('https://mail.example.com/api/webhooks/gmail/11111111-1111-4111-8111-111111111111?token=secret', {
      method: 'POST',
    });
    const outlookRequest = new Request('https://mail.example.com/api/webhooks/outlook/11111111-1111-4111-8111-111111111111', {
      method: 'POST',
    });

    expect(getRequestInputSchema(gmailRequest)).toBeDefined();
    expect(getRequestInputSchema(outlookRequest)).toBeDefined();
  });

  it('finds schema for context document provider-link routes', () => {
    const request = new Request(
      'https://mail.example.com/user/application/context/document/11111111-1111-4111-8111-111111111111/provider-link',
      { method: 'GET' },
    );

    expect(getRequestInputSchema(request)).toBeDefined();
  });

  it('sanitizes valid Gmail application input', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        displayName: 'Gmail inbox',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        gmailPubsubTopicName: 'projects/mailotter-prod/topics/gmail-inbox',
        ignored: true,
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        displayName: 'Gmail inbox',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        gmailPubsubTopicName: 'projects/mailotter-prod/topics/gmail-inbox',
      },
    });
  });

  it('rejects Gmail applications without Pub/Sub topic names', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        displayName: 'Gmail inbox',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }),
    ).resolves.toMatchObject({ success: false, scope: 'body' });
  });

  it('rejects unsupported providers', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        displayName: 'Bad provider',
        providerId: 'unsupported-provider',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }),
    ).resolves.toMatchObject({ success: false, scope: 'body' });
  });
});
