import { createContext, useContext } from 'react';

interface NoticeContextValue {
  showNotice: (type: 'success' | 'error', text: string) => void;
}

export const NoticeContext = createContext<NoticeContextValue | null>(null);

export function useShowNotice(): (type: 'success' | 'error', text: string) => void {
  const ctx = useContext(NoticeContext);
  if (!ctx) throw new Error('useShowNotice must be used inside NoticeContext.Provider');
  return ctx.showNotice;
}
