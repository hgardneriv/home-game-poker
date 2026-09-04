'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isNative, leaveToAppHome } from '@/hooks/native';

/**
 * Web: Home link (App Router).
 * iPhone: Close button that hard-navigates home. The WKWebView paints
 * under the Dynamic Island and has scrolling locked, so a top-of-page
 * Next.js Link is easy to miss and often a no-op.
 */
export function PrivacyExit() {
  const [native, setNative] = useState(false);

  useEffect(() => {
    setNative(isNative());
  }, []);

  if (native) {
    return (
      <p className="text-sm opacity-70">
        <button
          type="button"
          onClick={leaveToAppHome}
          className="min-h-11 min-w-11 -ml-2 rounded-lg px-2 py-2 text-left underline"
        >
          Close
        </button>
      </p>
    );
  }

  return (
    <p className="text-sm opacity-70">
      <Link href="/" className="underline">
        Home
      </Link>
    </p>
  );
}
