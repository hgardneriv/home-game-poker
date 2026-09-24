'use client';

import { useState } from 'react';

/** Copy the current URL — /stats is shareable, not a homepage widget. */
export function ShareLink({ label = 'Copy link' }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', url);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-current/20 px-3 py-1.5 text-sm font-semibold active:scale-95"
    >
      {copied ? '✓ Link copied' : label}
    </button>
  );
}
