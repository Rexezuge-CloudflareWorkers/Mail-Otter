import {
  CONNECTED_APPLICATION_STATUS_CONNECTED,
  CONNECTED_APPLICATION_STATUS_DRAFT,
  CONNECTED_APPLICATION_STATUS_ERROR,
} from '@mail-otter/shared/constants';
import type { ConnectedApplicationMetadata, EmailProcessingRule, SenderDomainFilters } from '@mail-otter/shared/model';
import { UUIDUtil } from '@mail-otter/shared/utils';
import type { ConnectedApplicationInternal } from '@mail-otter/shared/model';

// Provider-config keys read when assembling metadata (single source; the DAO
// owns the read/write SQL, this module owns shaping).
const METADATA_CONFIG_KEYS = [
  'gmail_pubsub_topic_name',
  'oauth2_enabled_features',
  'sender_domain_filters',
  'calendar_time_zone',
  'content_language',
  'email_processing_rules',
  'imap_host',
  'imap_port',
  'imap_username',
  'smtp_host',
  'smtp_port',
  'auto_execute_action_types',
  'attachment_vision_enabled',
] as const;

type MetadataConfigKey = (typeof METADATA_CONFIG_KEYS)[number];
type MetadataConfigMap = Record<MetadataConfigKey, string | null>;

interface WatchedFolderRow {
  folderPath: string;
  folderName: string;
}

// Write side-channel for the lazy legacy migration (Strategy seam so the
// pure assembly below stays side-effect free and unit-testable).
interface MetadataConfigWriter {
  setConfig(applicationId: string, key: string, value: string): Promise<void>;
  deleteConfig(applicationId: string, key: string): Promise<void>;
}

function normalizeStatus(row: ConnectedApplicationInternal): ConnectedApplicationMetadata['status'] {
  if (row.status === CONNECTED_APPLICATION_STATUS_CONNECTED) return CONNECTED_APPLICATION_STATUS_CONNECTED;
  if (row.status === CONNECTED_APPLICATION_STATUS_ERROR) return CONNECTED_APPLICATION_STATUS_ERROR;
  return CONNECTED_APPLICATION_STATUS_DRAFT;
}

interface ResolvedFilters {
  senderDomainFilters: SenderDomainFilters | null;
  resolvedRulesJson: string | null;
}

// Lazily migrates legacy `excludeRules` (stored inside `sender_domain_filters`)
// into email processing rules. Performs provider-config writes via `writer`.
async function migrateLegacyExcludeRules(
  applicationId: string,
  senderDomainFiltersJson: string | null,
  emailProcessingRulesJson: string | null,
  writer: MetadataConfigWriter,
): Promise<ResolvedFilters> {
  if (!senderDomainFiltersJson) {
    return { senderDomainFilters: null, resolvedRulesJson: emailProcessingRulesJson };
  }
  const parsed = JSON.parse(senderDomainFiltersJson) as { includeRules?: string[]; excludeRules?: string[] };
  const legacyExcludes = parsed.excludeRules ?? [];
  const includeRules = parsed.includeRules ?? [];
  if (legacyExcludes.length === 0) {
    return {
      senderDomainFilters: includeRules.length > 0 ? { includeRules } : null,
      resolvedRulesJson: emailProcessingRulesJson,
    };
  }
  const migratedRules: EmailProcessingRule[] = legacyExcludes.map((pattern) => ({
    ruleId: UUIDUtil.getRandomUUID(),
    name: `Block ${pattern}`,
    enabled: true,
    conditions: { operator: 'any' as const, matchers: [{ field: 'from' as const, op: 'matches_sender' as const, value: pattern }] },
    action: { type: 'skip' as const },
  }));
  const existingRules: EmailProcessingRule[] = emailProcessingRulesJson
    ? (JSON.parse(emailProcessingRulesJson) as EmailProcessingRule[])
    : [];
  const resolvedRulesJson = JSON.stringify([...existingRules, ...migratedRules]);
  await writer.setConfig(applicationId, 'email_processing_rules', resolvedRulesJson);
  if (includeRules.length > 0) {
    await writer.setConfig(applicationId, 'sender_domain_filters', JSON.stringify({ includeRules }));
    return { senderDomainFilters: { includeRules }, resolvedRulesJson };
  }
  await writer.deleteConfig(applicationId, 'sender_domain_filters');
  return { senderDomainFilters: null, resolvedRulesJson };
}

// Pure assembly: internal row + fetched config values + watched folders →
// public metadata. No I/O; covered directly by unit tests.
function assembleMetadata(
  row: ConnectedApplicationInternal,
  config: MetadataConfigMap,
  watchedFolders: WatchedFolderRow[],
  filters: ResolvedFilters,
): ConnectedApplicationMetadata {
  return {
    applicationId: row.application_id,
    userEmail: row.user_email,
    providerEmail: row.provider_email,
    displayName: row.display_name,
    providerId: row.provider_id,
    connectionMethod: row.connection_method,
    status: normalizeStatus(row),
    contextIndexingEnabled: row.context_indexing_enabled !== 0,
    ragRetrievalEnabled: row.rag_retrieval_enabled !== 0,
    attachmentVisionEnabled: config.attachment_vision_enabled !== 'false',
    maxContextDocuments: row.max_context_documents ?? null,
    enabledFeatures: config.oauth2_enabled_features ? (JSON.parse(config.oauth2_enabled_features) as string[]) : null,
    timeZone: config.calendar_time_zone ?? null,
    contentLanguage: config.content_language ?? null,
    senderDomainFilters: filters.senderDomainFilters,
    emailProcessingRules: filters.resolvedRulesJson ? (JSON.parse(filters.resolvedRulesJson) as EmailProcessingRule[]) : null,
    watchedFolders: watchedFolders.length > 0 ? watchedFolders.map((f) => ({ id: f.folderPath, name: f.folderName })) : null,
    lastErrorAcknowledgedAt: row.last_error_acknowledged_at ?? null,
    contextLastErrorAcknowledgedAt: row.context_last_error_acknowledged_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    gmailPubsubTopicName: config.gmail_pubsub_topic_name ?? undefined,
    imapHost: config.imap_host ?? null,
    imapPort: config.imap_port == null ? null : Number(config.imap_port),
    imapUsername: config.imap_username ?? null,
    smtpHost: config.smtp_host ?? null,
    smtpPort: config.smtp_port == null ? null : Number(config.smtp_port),
    autoExecuteActionTypes: config.auto_execute_action_types ? (JSON.parse(config.auto_execute_action_types) as string[]) : null,
  };
}

export { assembleMetadata, migrateLegacyExcludeRules, normalizeStatus, METADATA_CONFIG_KEYS };
export type { MetadataConfigKey, MetadataConfigMap, MetadataConfigWriter, ResolvedFilters, WatchedFolderRow };
