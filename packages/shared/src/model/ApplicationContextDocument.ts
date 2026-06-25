import type { ApplicationContextDocumentStatus as AppContextDocumentStatus, ProviderId } from '../constants';

interface AppContextDocument {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceType: string;
  sourceProviderId: ProviderId;
  vectorNamespace: string;
  vectorId: string;
  sourceDocumentFingerprint?: string | null;
  sourceThreadFingerprint?: string | null;
  titleFingerprint?: string | null;
  senderFingerprint?: string | null;
  contentFingerprint?: string | null;
  indexedTextChars: number;
  status: AppContextDocumentStatus;
  indexedAt?: number | null;
  deletedAt?: number | null;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface AppContextDocumentInternal {
  context_document_id: string;
  application_id: string;
  user_email: string;
  source_type: string;
  source_provider_id: ProviderId;
  source_document_id: string;
  source_thread_id: string | null;
  vector_namespace: string;
  vector_id: string;
  source_document_fingerprint: string | null;
  source_thread_fingerprint: string | null;
  title_fingerprint: string | null;
  sender_fingerprint: string | null;
  content_fingerprint: string | null;
  indexed_text_chars: number;
  status: AppContextDocumentStatus;
  indexed_at: number | null;
  deleted_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface AppContextSummary {
  applicationId: string;
  documentCount: number;
  lastIndexedAt?: number | null;
  lastDeleteAcceptedAt?: number | null;
  lastError?: string | null;
  lastErrorAt?: number | null;
}

interface AppContextDocumentList {
  documents: AppContextDocument[];
  nextCursor?: string;
}

interface AppContextDocumentSource {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceProviderId: ProviderId;
  sourceDocumentId: string;
  sourceThreadId?: string | null;
  status: AppContextDocumentStatus;
}

export type {
  AppContextDocument as ApplicationContextDocument,
  AppContextDocumentInternal as ApplicationContextDocumentInternal,
  AppContextDocumentList as ApplicationContextDocumentList,
  AppContextDocumentSource as ApplicationContextDocumentSource,
  AppContextSummary as ApplicationContextSummary,
};
