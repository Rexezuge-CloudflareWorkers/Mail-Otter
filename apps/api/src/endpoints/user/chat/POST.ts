import { IUserRoute } from '@/endpoints/IUserRoute';
import type { IUserEnv, IRequest, IResponse, RouteContext } from '@/endpoints/IUserRoute';
import { BadRequestError } from '@mail-otter/backend-errors';
import { ChatService } from '@mail-otter/backend-services/chat';
import type { ChatMessage, ChatSource } from '@mail-otter/backend-services/chat';

class ChatRoute extends IUserRoute<ChatRequest, ChatResponse, ChatEnv> {
  schema = {
    tags: ['Chat'],
    summary: 'Ask a question about your emails using AI and indexed context',
    responses: {
      '200': { description: 'AI answer with source citations' },
    },
  };

  protected async handleRequest(
    request: ChatRequest,
    env: ChatEnv,
    cxt: RouteContext<ChatEnv>,
  ): Promise<ChatResponse> {
    const userEmail = this.getAuthenticatedUserEmailAddress(cxt);
    const query = (request.query ?? '').trim();
    if (!query) throw new BadRequestError('query is required');

    return ChatService.chat({
      env,
      userEmail,
      query,
      applicationId: request.applicationId,
      history: request.history,
    });
  }
}

interface ChatRequest extends IRequest {
  query?: string;
  applicationId?: string;
  history?: ChatMessage[];
}

interface ChatResponse extends IResponse {
  answer: string;
  sources: ChatSource[];
  truncated: boolean;
}

type ChatEnv = IUserEnv & {
  AI: Ai;
  EMAIL_CONTEXT_INDEX?: Vectorize;
  AI_DAILY_NEURON_FALLBACK_THRESHOLD?: string;
  AI_EMBEDDING_MODEL?: string;
  AI_SUMMARY_MODEL?: string;
  CHAT_MAX_RESPONSE_TOKENS?: string;
  CHAT_VECTOR_QUERY_TOP_K?: string;
  CHAT_CONTEXT_TOP_K?: string;
  CHAT_MAX_HISTORY_MESSAGES?: string;
};

export { ChatRoute };
