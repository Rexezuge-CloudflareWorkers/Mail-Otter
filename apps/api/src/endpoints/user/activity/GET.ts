import { IUserRoute } from '@/endpoints/IUserRoute';
import type { ExtendedResponse, IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ActivityService } from '@mail-otter/backend-services/activity';
import type { ActivityEntry } from '@mail-otter/shared/model';

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
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const url = new URL(request.raw.url);
    const format = url.searchParams.get('format');
    const types = url.searchParams.getAll('types');
    const applicationId = this.getQueryParam(request, 'applicationId');

    if (format === 'csv') {
      const result = await ActivityService.listActivity(
        userEmail,
        { applicationId, types: types.length > 0 ? types : undefined, limit: 1000 },
        env,
      );
      const csv = toCsv(result.entries);
      return {
        rawBody: csv,
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="activity-export.csv"',
        },
      };
    }

    const cursor = this.getQueryParam(request, 'cursor');
    const limitParam = this.getQueryParam(request, 'limit');
    const limit = limitParam ? Math.max(1, Number(limitParam) || 50) : 50;

    return ActivityService.listActivity(
      userEmail,
      { applicationId, cursor, limit, types: types.length > 0 ? types : undefined },
      env,
    );
  }
}

function csvCell(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function toCsv(entries: ActivityEntry[]): string {
  const header = [
    'Event Type',
    'Application ID',
    'Timestamp ISO',
    'Provider Message ID',
    'Status / Execution Status',
    'Error Message',
    'Action ID',
    'Action Type',
    'Risk Level',
    'Triggered By',
  ].join(',');

  const rows = entries.map((entry) => {
    const ts = new Date(entry.timestamp * 1000).toISOString();
    if (entry.eventType === 'email_processed') {
      return [
        'email_processed',
        entry.applicationId,
        ts,
        entry.providerMessageId,
        entry.status,
        entry.errorMessage ?? '',
        '',
        '',
        '',
        '',
      ].map(csvCell).join(',');
    }
    if (entry.eventType === 'action_created') {
      return [
        'action_created',
        entry.applicationId,
        ts,
        '',
        '',
        '',
        entry.actionId,
        entry.actionType,
        entry.riskLevel,
        '',
      ].map(csvCell).join(',');
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
    ].map(csvCell).join(',');
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
