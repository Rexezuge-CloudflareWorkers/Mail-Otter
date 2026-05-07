import type { ApplicationContextDeletionStatus } from '../constants';

interface ApplicationContextDeletionRun {
  deletionRunId: string;
  applicationId: string;
  userEmail: string;
  vectorNamespace: string;
  requestedVectorCount: number;
  deletedVectorCount: number;
  mutationIds: string[];
  status: ApplicationContextDeletionStatus;
  errorMessage?: string | null | undefined;
  createdAt: number;
  updatedAt: number;
}

interface ApplicationContextDeletionRunInternal {
  deletion_run_id: string;
  application_id: string;
  user_email: string;
  vector_namespace: string;
  requested_vector_count: number;
  deleted_vector_count: number;
  mutation_ids: string | null;
  status: ApplicationContextDeletionStatus;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

interface ApplicationContextDeletionRunList {
  deletionRuns: ApplicationContextDeletionRun[];
  nextCursor?: string | undefined;
}

export type { ApplicationContextDeletionRun, ApplicationContextDeletionRunInternal, ApplicationContextDeletionRunList };
