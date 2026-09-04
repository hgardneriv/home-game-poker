'use client';

import { useEffect } from 'react';
import { attachNativePushHandlers, openGamePath } from '@/hooks/native';

/**
 * Registers tap-to-table handlers on every page so a cold-started app
 * (killed, then notification tap) can still land on the correct game.
 * Web: attachNativePushHandlers no-ops before any plugin import.
 */
export function NativePushRoot() {
  useEffect(() => {
    void attachNativePushHandlers({
      onOpenGame: (gameId) => {
        const path = openGamePath(gameId);
        if (!window.location.pathname.startsWith(path)) {
          window.location.assign(path);
        }
      },
    });
  }, []);
  return null;
}
