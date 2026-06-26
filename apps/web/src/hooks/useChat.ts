import { useState } from 'react';
import * as chatService from '../services/chatService';
import type { ChatMessage, ChatSource } from '../services/chatService';

interface UseChatOptions {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export function useChat({ showNotice }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatApplicationId, setChatApplicationId] = useState('');

  const sendMessage = async (query: string) => {
    const userMessage: ChatMessage = { role: 'user', content: query };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatLoading(true);
    try {
      const result = await chatService.sendChatMessage({
        query,
        applicationId: chatApplicationId || undefined,
        history: messages,
      });
      setMessages([...nextMessages, { role: 'assistant', content: result.answer }]);
      setSources(result.sources);
    } catch (e) {
      setMessages(messages);
      showNotice('error', e instanceof Error ? e.message : 'Unable To Send Chat Message.');
    } finally {
      setChatLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setSources([]);
  };

  return {
    messages,
    sources,
    chatLoading,
    chatApplicationId,
    setChatApplicationId,
    sendMessage,
    clearChat,
  };
}
