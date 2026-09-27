import { describe, expect, it, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import type { SecretsStoreSecret } from 'cloudflare:workers';
import { ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { setupActionIntegrationTest, createApplicationViaApi, seedConnectedApp } from '../helpers/setup';

const TEST_EMAIL = 'test@example.com';

/**
 * Retry claiming for `processed_messages` against real D1.
 *
 * The retry path used to be a read-then-write with no claim: the caller read
 * the row, accepted `processing` or `error`, wrote thread/fingerprint metadata
 * without ever transitioning `status`, and returned `true`. Two concurrent
 * callers therefore both proceeded and both ran the summarize pipeline, which
 * meant two AI summaries and two summary emails delivered for a single message.
 *
 * `allowExistingForRetry` is only set on workflow retry attempts, and two
 * workflow instances for the same provider message are genuinely concurrent
 * (a different queue message id yields a different workflow instance id), so
 * this has to be decided by the database rather than by a prior read.
 */
describe('ProcessedMessageDAO retry claim', () => {
  let applicationId: string;
  let dao: ProcessedMessageDAO;

  beforeAll(async () => {
    await setupActionIntegrationTest(env, TEST_EMAIL);
    applicationId = await createApplicationViaApi('Retry Claim App');
    dao = new ProcessedMessageDAO(env.DB);
  });

  const messageId = (label: string): string => `${label}-${crypto.randomUUID()}`;

  /**
   * Put a row into a terminal-ish state a retry would want to reclaim.
   */
  const seedRow = async (label: string, status: 'error' | 'processing'): Promise<string> => {
    const providerMessageId = messageId(label);
    const inserted = await dao.tryStart(applicationId, 'google-gmail', providerMessageId, 'thread-1');
    expect(inserted).toBe(true);
    if (status === 'error') {
      await dao.markError(applicationId, providerMessageId, 'previous failure');
    } else {
      // Backdate so the row is reclaimable rather than treated as in-flight.
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare('UPDATE processed_messages SET updated_at = ? WHERE application_id = ? AND provider_message_id = ?')
        .bind(now - 3600, applicationId, providerMessageId)
        .run();
    }
    return providerMessageId;
  };

  const claim = (providerMessageId: string): Promise<boolean> =>
    dao.tryStart(applicationId, 'google-gmail', providerMessageId, 'thread-1', { allowExistingForRetry: true });

  it('grants the claim to exactly one of two concurrent callers', async () => {
    const providerMessageId = await seedRow('error-race', 'error');

    const [first, second] = await Promise.all([claim(providerMessageId), claim(providerMessageId)]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('grants the claim only once across many concurrent callers', async () => {
    const providerMessageId = await seedRow('error-stampede', 'error');

    const results = await Promise.all(Array.from({ length: 8 }, () => claim(providerMessageId)));

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not steal a row that another worker is actively processing', async () => {
    const providerMessageId = await seedRow('processing-inflight', 'processing');
    // seedRow backdated this row, so first bring it up to date to model a
    // genuinely in-flight attempt.
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('UPDATE processed_messages SET updated_at = ? WHERE application_id = ? AND provider_message_id = ?')
      .bind(now, applicationId, providerMessageId)
      .run();

    expect(await claim(providerMessageId)).toBe(false);
  });

  it('reclaims a processing row abandoned by a crashed attempt', async () => {
    const providerMessageId = await seedRow('processing-stale', 'processing');

    // seedRow already backdated it well beyond the staleness window.
    expect(await claim(providerMessageId)).toBe(true);
  });

  it('transitions the claimed row back to processing', async () => {
    const providerMessageId = await seedRow('error-status', 'error');
    expect(await claim(providerMessageId)).toBe(true);

    const row = await dao.getByMessageId(applicationId, providerMessageId);
    expect(row?.status).toBe('processing');
  });

  it('refuses to claim an already-summarized message', async () => {
    const providerMessageId = messageId('already-summarized');
    expect(await dao.tryStart(applicationId, 'google-gmail', providerMessageId, 'thread-1')).toBe(true);
    await dao.markSummarized(applicationId, providerMessageId);

    expect(await claim(providerMessageId)).toBe(false);
  });

  it('refuses to claim an already-skipped message', async () => {
    const providerMessageId = messageId('already-skipped');
    expect(await dao.tryStart(applicationId, 'google-gmail', providerMessageId, 'thread-1')).toBe(true);
    await dao.markSkipped(applicationId, providerMessageId, 'filtered by rule');

    expect(await claim(providerMessageId)).toBe(false);
  });

  it('still short-circuits a plain tryStart once the message is claimed', async () => {
    const providerMessageId = await seedRow('error-plain', 'error');

    expect(await claim(providerMessageId)).toBe(true);
    // A non-retry tryStart must not proceed against a row already in progress.
    expect(await dao.tryStart(applicationId, 'google-gmail', providerMessageId, 'thread-1')).toBe(false);
  });

  it('does not claim across applications', async () => {
    const otherApplicationId = await seedConnectedApp(env.DB, TEST_EMAIL);
    const providerMessageId = messageId('cross-application');
    expect(await dao.tryStart(applicationId, 'google-gmail', providerMessageId, 'thread-1')).toBe(true);
    await dao.markError(applicationId, providerMessageId, 'failed');

    const otherDao = new ProcessedMessageDAO(env.DB);
    const claimedElsewhere = await otherDao.tryStart(otherApplicationId, 'google-gmail', providerMessageId, 'thread-1', {
      allowExistingForRetry: true,
    });
    // A different application must start its own row rather than claim this one.
    expect(claimedElsewhere).toBe(true);
    const row = await otherDao.getByMessageId(otherApplicationId, providerMessageId);
    expect(row?.applicationId).toBe(otherApplicationId);
  });

  it('exposes the master-key secret on the seeded app so encryption paths stay covered', () => {
    const secret = (env as Record<string, unknown>)['ACTION_ENCRYPTION_KEY_SECRET'] as SecretsStoreSecret;
    expect(secret).toBeDefined();
  });
});
