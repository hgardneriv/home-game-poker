'use client';

import { useSyncExternalStore } from 'react';

/** Last table this browser/app sat at — not identity (that's the httpOnly cookie). */
export const LAST_GAME_KEY = 'hg:lastGameId';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

export function readLastGameId(): string | null {
  try {
    return localStorage.getItem(LAST_GAME_KEY);
  } catch {
    return null;
  }
}

export function writeLastGameId(gameId: string): void {
  try {
    localStorage.setItem(LAST_GAME_KEY, gameId);
    window.dispatchEvent(new Event('storage'));
  } catch {
    // storage unavailable (private mode) — resume simply won't be offered
  }
}

export function clearLastGameId(): void {
  try {
    localStorage.removeItem(LAST_GAME_KEY);
    window.dispatchEvent(new Event('storage'));
  } catch {
    // ignore
  }
}

/** Server snapshot is null so hydration stays clean. */
export function useLastGameId(): string | null {
  return useSyncExternalStore(subscribe, readLastGameId, () => null);
}
