import { createContext, useContext } from 'react';
import type { CurrentUser } from '../../components/types';

export const UserContext = createContext<CurrentUser | null>(null);

export function useCurrentUserData(): CurrentUser {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useCurrentUserData must be used inside UserContext.Provider');
  return ctx;
}
