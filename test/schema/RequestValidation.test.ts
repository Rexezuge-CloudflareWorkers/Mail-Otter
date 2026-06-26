import { describe, expect, it } from 'vitest';
import { getRequestInputSchema, validateRequestInput } from '../../packages/shared/src/schema';
import { EmailProcessingRuleSchema } from '../../packages/shared/src/schema/common';

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

  it('passes autoExecuteActionTypes through PUT /user/application schema', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'PUT' });
    const result = await validateRequestInput(request, {
      applicationId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Outlook inbox',
      providerId: 'microsoft-outlook',
      connectionMethod: 'oauth2',
      autoExecuteActionTypes: ['delivery.track_package', 'manual.todo'],
    });
    expect(result).toMatchObject({ success: true });
    expect((result as { success: true; data: Record<string, unknown> }).data.autoExecuteActionTypes).toEqual([
      'delivery.track_package',
      'manual.todo',
    ]);
  });

  it('passes timeZone through PUT /user/application schema', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'PUT' });
    const result = await validateRequestInput(request, {
      applicationId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Outlook inbox',
      providerId: 'microsoft-outlook',
      connectionMethod: 'oauth2',
      timeZone: 'America/New_York',
    });
    expect(result).toMatchObject({ success: true });
    expect((result as { success: true; data: Record<string, unknown> }).data.timeZone).toBe('America/New_York');
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

  describe('PUT /user/application/context', () => {
    const applicationId = '11111111-1111-4111-8111-111111111111';

    it('accepts body with only contextIndexingEnabled', async () => {
      const request = new Request('https://mail.example.com/user/application/context', { method: 'PUT' });
      await expect(validateRequestInput(request, { applicationId, contextIndexingEnabled: false })).resolves.toMatchObject({ success: true });
    });

    it('accepts body with only ragRetrievalEnabled', async () => {
      const request = new Request('https://mail.example.com/user/application/context', { method: 'PUT' });
      await expect(validateRequestInput(request, { applicationId, ragRetrievalEnabled: false })).resolves.toMatchObject({ success: true });
    });

    it('accepts body with only maxContextDocuments', async () => {
      const request = new Request('https://mail.example.com/user/application/context', { method: 'PUT' });
      await expect(validateRequestInput(request, { applicationId, maxContextDocuments: 10 })).resolves.toMatchObject({ success: true });
    });
  });

  describe('EmailProcessingRuleSchema', () => {
    const validRule = {
      ruleId: '11111111-1111-4111-8111-111111111111',
      name: 'Skip Newsletters',
      enabled: true,
      conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'contains', value: 'newsletter' }] },
      action: { type: 'skip' },
    };

    it('accepts a valid skip rule', () => {
      expect(EmailProcessingRuleSchema.safeParse(validRule).success).toBe(true);
    });

    it('rejects matches_sender on non-from field', () => {
      const invalid = { ...validRule, conditions: { operator: 'any', matchers: [{ field: 'subject', op: 'matches_sender', value: '@domain.com' }] } };
      expect(EmailProcessingRuleSchema.safeParse(invalid).success).toBe(false);
    });

    it('rejects prepend_instruction without instruction text', () => {
      const invalid = { ...validRule, action: { type: 'prepend_instruction' } };
      expect(EmailProcessingRuleSchema.safeParse(invalid).success).toBe(false);
    });

    it('accepts prepend_instruction with instruction text', () => {
      const valid = { ...validRule, action: { type: 'prepend_instruction', instruction: 'Extract invoice number.' } };
      expect(EmailProcessingRuleSchema.safeParse(valid).success).toBe(true);
    });

    it('accepts always matcher with match_all op on a pre-processing rule', () => {
      const valid = { ...validRule, conditions: { operator: 'any', matchers: [{ field: 'always', op: 'match_all' }] } };
      expect(EmailProcessingRuleSchema.safeParse(valid).success).toBe(true);
    });

    it('accepts always matcher with match_all op on a post-processing rule', () => {
      const valid = { ...validRule, action: { type: 'star_message' }, conditions: { operator: 'any', matchers: [{ field: 'always', op: 'match_all' }] } };
      expect(EmailProcessingRuleSchema.safeParse(valid).success).toBe(true);
    });

    it('rejects always matcher with wrong op', () => {
      const invalid = { ...validRule, conditions: { operator: 'any', matchers: [{ field: 'always', op: 'contains' }] } };
      expect(EmailProcessingRuleSchema.safeParse(invalid).success).toBe(false);
    });
  });
});
