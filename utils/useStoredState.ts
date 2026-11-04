'use client';

import { useCallback, useSyncExternalStore } from 'react';

// A string setting remembered in this browser (e.g. the semester a page was last filtered to).
// Storage can be blocked (private window); then it simply behaves like normal state for the visit.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();
const read = (key: string) => {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
};

export function useStoredState<T extends string>(key: string, initial: T, allowed?: readonly string[]): [T, (value: T) => void] {
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = (stored !== null && (!allowed || allowed.includes(stored)) ? stored : initial) as T;
  const set = useCallback((next: T) => {
    memory.set(key, next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // storage blocked — the in-memory copy still works for this visit
    }
    listeners.forEach((fn) => fn());
  }, [key]);
  return [value, set];
}
