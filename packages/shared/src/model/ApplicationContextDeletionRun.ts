import type { ApplicationContextDeletionStatus as AppContextDeletionStatus } from '../constants';

interface AppContextDeletionRun {
  deletionRunId: string;
  applicationId: string;
  userEmail: string;
  vectorNamespace: string;
  requestedVectorCount: number;
  deletedVectorCount: number;
  mutationIds: string[];
  status: AppContextDeletionStatus;
  errorMessage?: string | null;
  createdAt: number;
  updatedAt: number;
}

interface AppContextDeletionRunInternal {
  deletion_run_id: string;
  application_id: string;
  user_email: string;
  vector_namespace: string;
  requested_vector_count: number;
  deleted_vector_count: number;
  mutation_ids: string | null;
  status: AppContextDeletionStatus;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

interface AppContextDeletionRunList {
  deletionRuns: AppContextDeletionRun[];
  nextCursor?: string;
}

export type { AppContextDeletionRun as ApplicationContextDeletionRun, AppContextDeletionRunInternal as ApplicationContextDeletionRunInternal, AppContextDeletionRunList as ApplicationContextDeletionRunList };
