import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_GAME_KEY, clearLastGameId, readLastGameId, writeLastGameId } from './lastGame';

function mockStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', {
    localStorage,
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

describe('lastGame', () => {
  beforeEach(() => {
    mockStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts empty', () => {
    expect(readLastGameId()).toBeNull();
  });

  it('remembers and clears a table id', () => {
    writeLastGameId('abc123');
    expect(readLastGameId()).toBe('abc123');
    clearLastGameId();
    expect(readLastGameId()).toBeNull();
  });
});
