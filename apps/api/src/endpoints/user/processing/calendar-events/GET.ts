import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { Tokens, createRequestScope } from '@mail-otter/backend-services/composition';
import type { SyncedCalendarEvent } from '@mail-otter/shared/model';

class ListProcessingCalendarEventsRoute extends IUserRoute<ListProcessingCalendarEventsRequest, ListProcessingCalendarEventsResponse, ListProcessingCalendarEventsEnv> {
  schema = {
    tags: ['Processing'],
    summary: 'List synced calendar events for the authenticated user',
    responses: {
      '200': { description: 'Synced calendar events' },
    },
  };

  protected async handleRequest(
    request: ListProcessingCalendarEventsRequest,
    env: ListProcessingCalendarEventsEnv,
    cxt: RouteContext<ListProcessingCalendarEventsEnv>,
  ): Promise<ListProcessingCalendarEventsResponse> {
    const scope = createRequestScope(env);
    return scope.get(Tokens.ProcessingService).listCalendarEvents(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        applicationId: this.getQueryParam(request, 'applicationId'),
        cursor: this.getQueryParam(request, 'cursor'),
      },
    );
  }
}

type ListProcessingCalendarEventsRequest = IRequest;

interface ListProcessingCalendarEventsResponse extends IResponse {
  events: SyncedCalendarEvent[];
  nextCursor?: string;
}

type ListProcessingCalendarEventsEnv = IUserEnv;

export { ListProcessingCalendarEventsRoute };
