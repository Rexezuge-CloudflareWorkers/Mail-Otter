import { describe, expect, it, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { applyMigrations } from '../helpers/migrations';

let appCounter = 0;

async function seedApplication(providerId: string = 'microsoft-outlook'): Promise<string> {
  appCounter++;
  const applicationId = `app-${appCounter}-${Date.now()}`;
  const email = `user-${appCounter}@example.com`;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO users (email, created_at, updated_at) VALUES (?, ?, ?)`,
  ).bind(email, now, now).run();
  await env.DB.prepare(
    `INSERT INTO connected_applications (application_id, user_email, display_name, provider_id, connection_method, encrypted_credentials, credentials_iv, status, created_at, updated_at) ` +
    `VALUES (?, ?, ?, ?, 'oauth2', 'enc', 'iv', 'connected', ?, ?)`,
  ).bind(applicationId, email, 'Test App', providerId, now, now).run();
  return applicationId;
}

describe('ProcessedMessageDAO', () => {
  beforeAll(async () => {
    await applyMigrations(env.DB);
  });

  it('inserts a new processed message row when tryStart is called for an unseen message', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);

    const result: boolean = await dao.tryStart(applicationId, 'microsoft-outlook', 'msg-1', 'thread-1');

    expect(result).toBe(true);
    const message = await dao.getByMessageId(applicationId, 'msg-1');
    expect(message).toBeDefined();
    expect(message!.processedMessageId).toBeDefined();
    expect(message!.status).toBe('processing');
  });

  it('returns false when tryStart encounters an existing application_id + provider_message_id pair', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'dup-msg', 'thread-1');

    const result: boolean = await dao.tryStart(applicationId, 'microsoft-outlook', 'dup-msg', 'thread-1');

    expect(result).toBe(false);
  });

  it('allows different applications to process the same provider message id', async () => {
    const appA = await seedApplication();
    const appB = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);

    const resultA: boolean = await dao.tryStart(appA, 'microsoft-outlook', 'shared-msg', 'thread-1');
    const resultB: boolean = await dao.tryStart(appB, 'microsoft-outlook', 'shared-msg', 'thread-1');

    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
  });

  it('does not start a moved message when the stable provider message fingerprint already exists', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'old-provider-id', 'thread-1', {
      providerStableMessageFingerprint: 'stable-1',
    });

    const result: boolean = await dao.tryStart(applicationId, 'microsoft-outlook', 'new-provider-id', 'thread-1', {
      providerStableMessageFingerprint: 'stable-1',
    });

    expect(result).toBe(false);
  });

  it('starts a new reply when its stable fingerprint differs from the existing one', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'old-msg', 'thread-1', {
      providerStableMessageFingerprint: 'stable-1',
    });

    const result: boolean = await dao.tryStart(applicationId, 'microsoft-outlook', 'reply-msg', 'thread-1', {
      providerStableMessageFingerprint: 'stable-2',
    });

    expect(result).toBe(true);
  });

  it('marks a message as summarized and tracks the sent timestamp', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'summarize-me', 'thread-1');

    await dao.markSummarized(applicationId, 'summarize-me');

    const message = await dao.getByMessageId(applicationId, 'summarize-me');
    expect(message!.status).toBe('summarized');
    expect(message!.summarySentAt).toBeDefined();
    expect(typeof message!.summarySentAt).toBe('number');
  });

  it('marks a message as skipped with a reason', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'skip-me', 'thread-1');

    await dao.markSkipped(applicationId, 'skip-me', 'Message was deleted before processing.');

    const message = await dao.getByMessageId(applicationId, 'skip-me');
    expect(message!.status).toBe('skipped');
    expect(message!.errorMessage).toBe('Message was deleted before processing.');
  });

  it('marks a message as error', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'error-me', 'thread-1');

    await dao.markError(applicationId, 'error-me', 'Provider API failure.');

    const message = await dao.getByMessageId(applicationId, 'error-me');
    expect(message!.status).toBe('error');
    expect(message!.errorMessage).toBe('Provider API failure.');
  });

  it('reports the latest summarized message for an application', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'older-msg', 'thread-1');
    await dao.markSummarized(applicationId, 'older-msg');
    await dao.tryStart(applicationId, 'microsoft-outlook', 'newer-msg', 'thread-1');
    await dao.markSummarized(applicationId, 'newer-msg');

    const latest = await dao.getLatestForApplication(applicationId);

    expect(latest!.providerMessageId).toBe('newer-msg');
  });

  it('deletes processed messages older than the given timestamp with matching status', async () => {
    const applicationId = await seedApplication();
    const dao = new ProcessedMessageDAO(env.DB);
    const now = Math.floor(Date.now() / 1000);
    await dao.tryStart(applicationId, 'microsoft-outlook', 'delete-old', 'thread-1');
    await dao.markSummarized(applicationId, 'delete-old');
    await env.DB.prepare(
      `UPDATE processed_messages SET updated_at = ? WHERE application_id = ? AND provider_message_id = 'delete-old'`,
    ).bind(now - 86_400, applicationId).run();

    const deleted = await dao.deleteOlderThan(now - 3600, ['summarized'], 10);

    expect(deleted).toBe(1);
    const message = await dao.getByMessageId(applicationId, 'delete-old');
    expect(message).toBeUndefined();
  });
});
