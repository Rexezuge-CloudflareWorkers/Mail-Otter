import { IUserRoute } from '@/endpoints/IUserRoute';
import type { ExtendedResponse, IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActivityService } from '@mail-otter/backend-services/activity';
import { getBackendStrings } from '@mail-otter/shared/i18n';
import type { ActivityEntry } from '@mail-otter/shared/model';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';

class ListActivityRoute extends IUserRoute<ListActivityRequest, ListActivityResponse, ListActivityEnv> {
  schema = {
    tags: ['Activity'],
    summary: 'List activity entries for the authenticated user',
    responses: {
      '200': { description: 'Activity entries' },
    },
  };

  protected async handleRequest(
    request: ListActivityRequest,
    env: ListActivityEnv,
    cxt: RouteContext<ListActivityEnv>,
  ): Promise<ListActivityResponse | ExtendedResponse<ListActivityResponse>> {
    const user = this.getAuthenticatedUser(cxt);
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const format = this.getQueryParam(request, 'format');
    const types = this.getQueryParams(request, 'types');
    const applicationId = this.getQueryParam(request, 'applicationId');

    if (format === 'csv') {
      // Paged to exhaustion rather than asking for one oversized page, which was
      // silently clamped to 100 rows and truncated the download.
      const { entries, truncated } = await ActivityService.exportActivity(
        user,
        { applicationId, types: types.length > 0 ? types : undefined },
        env,
      );
      const csv = toCsv(entries, await resolveUserLocale(env, userEmail));
      return {
        rawBody: truncated ? `${csv}\n# export truncated: more entries remain\n` : csv,
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="activity-export.csv"',
          'X-Activity-Export-Truncated': truncated ? 'true' : 'false',
        },
      };
    }

    const cursor = this.getQueryParam(request, 'cursor');
    const limitParam = this.getQueryParam(request, 'limit');
    const limit = limitParam ? Math.max(1, Number(limitParam) || 50) : 50;

    return ActivityService.listActivity(user, { applicationId, cursor, limit, types: types.length > 0 ? types : undefined }, env);
  }
}

function csvCell(value: string): string {
  return value.includes(',') || value.includes('"') || value.includes('\n') ? `"${value.replaceAll('"', '""')}"` : value;
}

async function resolveUserLocale(env: ListActivityEnv, userEmail: string): Promise<string> {
  const scope = createRequestScope(env);
  return (await scope.get(Tokens.UserService).getPreferredLanguage(userEmail)) ?? 'en';
}

function toCsv(entries: ActivityEntry[], locale?: string | null): string {
  const header = getBackendStrings(locale).csv.header;

  const rows = entries.map((entry) => {
    const ts = new Date(entry.timestamp * 1000).toISOString();
    if (entry.eventType === 'email_processed') {
      return ['email_processed', entry.applicationId, ts, entry.providerMessageId, entry.status, entry.errorMessage ?? '', '', '', '', '']
        .map(csvCell)
        .join(',');
    }
    if (entry.eventType === 'action_created') {
      return ['action_created', entry.applicationId, ts, '', '', '', entry.actionId, entry.actionType, entry.riskLevel, '']
        .map(csvCell)
        .join(',');
    }
    return [
      'action_executed',
      entry.applicationId,
      ts,
      '',
      entry.executionStatus,
      '',
      entry.actionId,
      entry.actionType,
      '',
      entry.triggeredBy,
    ]
      .map(csvCell)
      .join(',');
  });

  return [header, ...rows].join('\n');
}

type ListActivityRequest = IRequest;

interface ListActivityResponse extends IResponse {
  entries: ActivityEntry[];
  nextCursor?: string;
}

type ListActivityEnv = IUserEnv;

export { ListActivityRoute };
