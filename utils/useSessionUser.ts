'use client';

import { useEffect, useState } from 'react';
import { getSessionUser, type SessionUser } from './session';

// The signed-in user for display purposes (name, role). Null until loaded.
export function useSessionUser() {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    getSessionUser().then(setUser);
  }, []);
  return user;
}
