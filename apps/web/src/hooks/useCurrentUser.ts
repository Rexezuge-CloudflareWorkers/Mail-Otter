import { useEffect, useState } from 'react';
import type { CurrentUser } from '../../components/types';
import { loadCurrentUser } from '../services/userService';

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    loadCurrentUser()
      .then((me) => {
        setUser(me);
        setAuthorized(true);
      })
      .catch(() => setAuthorized(false));
  }, []);

  return { user, authorized };
}
