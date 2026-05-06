import type { ApplicationContextDocumentStatus, ProviderId } from '../constants';

interface ApplicationContextDocument {
  contextDocumentId: string;
  applicationId: string;
  userEmail: string;
  sourceType: string;
  sourceProviderId: ProviderId;
  sourceDocumentId: string;
  sourceThreadId?: string | null | undefined;
  vectorNamespace: string;
  vectorId: string;
  title?: string | null | undefined;
  sender?: string | null | undefined;
  indexedText?: string | null | undefined;
  status: ApplicationContextDocumentStatus;
  indexedAt?: number | null | undefined;
  deletedAt?: number | null | undefined;
  lastError?: string | null | undefined;
  createdAt: number;
  updatedAt: number;
}

interface ApplicationContextDocumentInternal {
  context_document_id: string;
  application_id: string;
  user_email: string;
  source_type: string;
  source_provider_id: ProviderId;
  source_document_id: string;
  source_thread_id: string | null;
  vector_namespace: string;
  vector_id: string;
  title: string | null;
  sender: string | null;
  indexed_text: string | null;
  status: ApplicationContextDocumentStatus;
  indexed_at: number | null;
  deleted_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

interface ApplicationContextSummary {
  applicationId: string;
  documentCount: number;
  lastIndexedAt?: number | null | undefined;
  lastDeleteAcceptedAt?: number | null | undefined;
  lastError?: string | null | undefined;
}

interface ApplicationContextDocumentList {
  documents: ApplicationContextDocument[];
  nextCursor?: string | undefined;
}

export type {
  ApplicationContextDocument,
  ApplicationContextDocumentInternal,
  ApplicationContextDocumentList,
  ApplicationContextSummary,
};
