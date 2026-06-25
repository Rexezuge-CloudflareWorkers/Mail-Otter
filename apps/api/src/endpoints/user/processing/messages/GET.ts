import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { ProcessingService } from '@mail-otter/backend-services/processing';
import type { ProcessedMessage } from '@mail-otter/shared/model';
import type { ProcessedMessageStatus } from '@mail-otter/shared/constants';

class ListProcessedMessagesRoute extends IUserRoute<ListProcessedMessagesRequest, ListProcessedMessagesResponse, ListProcessedMessagesEnv> {
  schema = {
    tags: ['Processing'],
    summary: 'List processed messages for the authenticated user',
    responses: {
      '200': { description: 'Processed messages' },
    },
  };

  protected async handleRequest(
    request: ListProcessedMessagesRequest,
    env: ListProcessedMessagesEnv,
    cxt: RouteContext<ListProcessedMessagesEnv>,
  ): Promise<ListProcessedMessagesResponse> {
    return ProcessingService.listProcessedMessages(
      this.getAuthenticatedUserEmailAddress(cxt),
      {
        applicationId: this.getQueryParam(request, 'applicationId'),
        status: this.getQueryParam(request, 'status') as ProcessedMessageStatus | undefined,
        cursor: this.getQueryParam(request, 'cursor'),
      },
      env,
    );
  }
}

type ListProcessedMessagesRequest = IRequest;

interface ListProcessedMessagesResponse extends IResponse {
  messages: ProcessedMessage[];
  nextCursor?: string;
}

type ListProcessedMessagesEnv = IUserEnv;

export { ListProcessedMessagesRoute };
