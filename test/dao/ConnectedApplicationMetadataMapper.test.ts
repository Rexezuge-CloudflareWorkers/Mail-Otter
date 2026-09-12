import { describe, expect, it, vi } from 'vitest';
import {
  METADATA_CONFIG_KEYS,
  assembleMetadata,
  migrateLegacyExcludeRules,
  normalizeStatus,
} from '@mail-otter/backend-data/dao/ConnectedApplicationMetadataMapper';
import type { MetadataConfigMap } from '@mail-otter/backend-data/dao/ConnectedApplicationMetadataMapper';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    application_id: 'app-1',
    user_email: 'u@x',
    provider_email: 'p@x',
    display_name: 'App',
    provider_id: 'google-gmail',
    connection_method: 'oauth2',
    encrypted_credentials: 'e',
    credentials_iv: 'iv',
    status: 'connected',
    context_indexing_enabled: 1,
    rag_retrieval_enabled: 0,
    max_context_documents: null,
    last_error_acknowledged_at: null,
    context_last_error_acknowledged_at: null,
    created_at: 1,
    updated_at: 2,
    ...overrides,
  } as never;
}

function emptyConfig(): MetadataConfigMap {
  return Object.fromEntries(METADATA_CONFIG_KEYS.map((k) => [k, null])) as MetadataConfigMap;
}

function writer() {
  return { setConfig: vi.fn(async () => undefined), deleteConfig: vi.fn(async () => undefined) };
}

describe('ConnectedApplicationMetadataMapper', () => {
  it('normalizes unknown statuses to draft', () => {
    expect(normalizeStatus(makeRow({ status: 'connected' }))).toBe('connected');
    expect(normalizeStatus(makeRow({ status: 'error' }))).toBe('error');
    expect(normalizeStatus(makeRow({ status: 'weird' }))).toBe('draft');
  });

  it('assembles metadata from row, config, and folders', () => {
    const config = { ...emptyConfig(), calendar_time_zone: 'Europe/Berlin', imap_port: '993', oauth2_enabled_features: '["a"]' };
    const metadata = assembleMetadata(
      makeRow(),
      config,
      [{ folderPath: 'INBOX', folderName: 'Inbox' }],
      { senderDomainFilters: { includeRules: ['x'] }, resolvedRulesJson: null },
    );
    expect(metadata).toMatchObject({
      applicationId: 'app-1',
      timeZone: 'Europe/Berlin',
      imapPort: 993,
      enabledFeatures: ['a'],
      watchedFolders: [{ id: 'INBOX', name: 'Inbox' }],
      senderDomainFilters: { includeRules: ['x'] },
      emailProcessingRules: null,
      attachmentVisionEnabled: true,
      contextIndexingEnabled: true,
      ragRetrievalEnabled: false,
    });
  });

  it('maps empty folders to null and vision opt-out to false', () => {
    const metadata = assembleMetadata(makeRow(), { ...emptyConfig(), attachment_vision_enabled: 'false' }, [], {
      senderDomainFilters: null,
      resolvedRulesJson: '[]',
    });
    expect(metadata.watchedFolders).toBeNull();
    expect(metadata.attachmentVisionEnabled).toBe(false);
    expect(metadata.emailProcessingRules).toEqual([]);
  });

  it('passes through when no legacy filters exist', async () => {
    const w = writer();
    await expect(migrateLegacyExcludeRules('app-1', null, '{"a":1}', w)).resolves.toEqual({
      senderDomainFilters: null,
      resolvedRulesJson: '{"a":1}',
    });
    expect(w.setConfig).not.toHaveBeenCalled();
    await expect(
      migrateLegacyExcludeRules('app-1', JSON.stringify({ includeRules: ['a'] }), null, w),
    ).resolves.toEqual({ senderDomainFilters: { includeRules: ['a'] }, resolvedRulesJson: null });
  });

  it('migrates legacy excludeRules into processing rules', async () => {
    const w = writer();
    const result = await migrateLegacyExcludeRules(
      'app-1',
      JSON.stringify({ includeRules: ['keep'], excludeRules: ['spam.com'] }),
      JSON.stringify([{ ruleId: 'old' }]),
      w,
    );
    expect(result.senderDomainFilters).toEqual({ includeRules: ['keep'] });
    const rules = JSON.parse(result.resolvedRulesJson!) as Array<{ name: string; ruleId: string }>;
    expect(rules).toHaveLength(2);
    expect(rules[1].name).toBe('Block spam.com');
    expect(w.setConfig).toHaveBeenCalledWith('app-1', 'email_processing_rules', expect.any(String));
    expect(w.setConfig).toHaveBeenCalledWith('app-1', 'sender_domain_filters', JSON.stringify({ includeRules: ['keep'] }));
  });

  it('deletes the filter row when only excludes existed', async () => {
    const w = writer();
    const result = await migrateLegacyExcludeRules('app-1', JSON.stringify({ excludeRules: ['x'] }), null, w);
    expect(result.senderDomainFilters).toBeNull();
    expect(w.deleteConfig).toHaveBeenCalledWith('app-1', 'sender_domain_filters');
  });
});
