'use client';

import { useState } from 'react';
import { nativeShare } from '@/hooks/native';

export function InviteButton({ gameId }: { gameId: string }) {
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const url = `${window.location.origin}/game/${gameId}`;
    try {
      if (await nativeShare('Poker Party!', 'Join my Texas Hold’em table:', url)) return;
      // Browser / Safari: Web Share when present, clipboard otherwise.
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Poker Party!',
            text: 'Join my Texas Hold’em table:',
            url,
          });
          return;
        } catch {
          // user dismissed the sheet — fall through to clipboard
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        prompt('Copy this link:', url);
      }
    } catch {
      // keep the tap from becoming an unhandled rejection (Next overlay)
    }
  };

  return (
    <button
      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
      onClick={invite}
    >
      {copied ? '✓ Link copied' : '📤 Invite'}
    </button>
  );
}
