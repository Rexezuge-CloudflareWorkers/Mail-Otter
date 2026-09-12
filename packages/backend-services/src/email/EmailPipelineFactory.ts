import { ApplicationContextDAO, ProcessedMessageDAO } from '@mail-otter/backend-data/dao';
import { EmailProcessingAuditLogger } from './EmailProcessingAuditLogger';
import { EmailPipelineOrchestrator } from './EmailPipeline';
import type { OrchestratorEnv } from './EmailSummaryOrchestrator';
import type { D1Queryable } from '@mail-otter/backend-data/utils';

/**
 * Factory centralizing `EmailPipelineOrchestrator` construction.
 * Previously each `generate*Summary` method in `EmailProcessingUtil`
 * repeated the same 4-line DAO/logger/orchestrator wiring; all four
 * now delegate here so pipeline dependencies change in one place.
 */
class EmailPipelineFactory {
  constructor(private readonly db: D1Queryable) {}

  public create(env: OrchestratorEnv, enabledApplicationIds: string[]): EmailPipelineOrchestrator {
    return new EmailPipelineOrchestrator(
      new ProcessedMessageDAO(this.db),
      new EmailProcessingAuditLogger(new ApplicationContextDAO(this.db)),
      env,
      enabledApplicationIds,
    );
  }
}

export { EmailPipelineFactory };
