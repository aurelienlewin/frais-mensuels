import { useSyncExternalStore } from 'react';

/** Phones (portrait + landscape) and small tablets. Mirrors the `desk` breakpoint in styles.css. */
export const COMPACT_QUERY = '(max-width: 959px)';

function subscribe(onChange: () => void) {
  try {
    const mq = window.matchMedia(COMPACT_QUERY);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  } catch {
    return () => {};
  }
}

export function isCompactNow(): boolean {
  try {
    return window.matchMedia(COMPACT_QUERY).matches;
  } catch {
    return false;
  }
}

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompactNow, () => false);
}
