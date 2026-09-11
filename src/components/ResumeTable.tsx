'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isNative } from '@/hooks/native';
import { useLastGameId } from '@/hooks/lastGame';

/**
 * Web: a button so you can go back without creating a new table.
 * Native: the Capacitor WebView always boots at `/`, so we send you
 * straight to the last table — that's the force-quit cookie proof.
 */
export function ResumeTable() {
  const gameId = useLastGameId();
  const router = useRouter();

  useEffect(() => {
    if (gameId && isNative()) router.replace(`/game/${gameId}`);
  }, [gameId, router]);

  if (!gameId) return null;

  if (isNative()) {
    return (
      <p className="text-center text-sm opacity-70" aria-live="polite">
        Returning to your table…
      </p>
    );
  }

  return (
    <Link
      href={`/game/${gameId}`}
      className="block rounded-lg border border-emerald-600 bg-emerald-600/10 px-4 py-3 text-center font-semibold text-emerald-800 dark:text-emerald-200"
    >
      Return to table
    </Link>
  );
}
