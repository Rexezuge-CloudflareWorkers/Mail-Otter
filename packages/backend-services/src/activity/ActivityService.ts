import { ActivityDAO } from '@mail-otter/backend-data/dao';
import type { ActivityEntryList, ActivityEventType } from '@mail-otter/shared/model';

interface ListActivityInput {
  applicationId?: string;
  cursor?: string;
  limit?: number;
  types?: string[];
}

const ActivityService = {
  async listActivity(
    userEmail: string,
    input: ListActivityInput,
    env: { DB: D1Database },
  ): Promise<ActivityEntryList> {
    return new ActivityDAO(env.DB).listForUser(userEmail, {
      applicationId: input.applicationId,
      cursor: input.cursor,
      limit: Math.min(input.limit ?? 50, 100),
      types: input.types as ActivityEventType[] | undefined,
    });
  },
};

export { ActivityService };
export type { ListActivityInput };
