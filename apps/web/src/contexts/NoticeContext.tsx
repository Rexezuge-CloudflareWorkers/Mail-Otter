import { createContext } from 'react';

interface NoticeContextValue {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export const NoticeContext = createContext<NoticeContextValue | null>(null);
