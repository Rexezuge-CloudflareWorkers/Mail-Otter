import { apiFetch, readJson } from '../../components/utils';

export interface ChatSource {
  vectorId: string;
  title: string;
  sender: string;
  applicationId: string;
  score: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  truncated: boolean;
}

export async function sendChatMessage(options: {
  query: string;
  applicationId?: string;
  history: ChatMessage[];
}): Promise<ChatResponse> {
  return readJson<ChatResponse>(
    await apiFetch('/user/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  );
}
