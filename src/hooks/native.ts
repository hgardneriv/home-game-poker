/**
 * Optional Capacitor bridges. On the web these are no-ops so the same
 * bundle keeps working in the browser. Dynamic imports keep Next from
 * treating native plugins as required at SSR.
 */

function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** Resume from background — iOS suspends the WebView and kills SSE. */
export async function onNativeAppActive(handler: () => void): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handler();
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

/**
 * Native share sheet. `true` means the Capacitor path ran (shared *or*
 * dismissed / failed) — the caller must not also invoke `navigator.share`
 * in the same WKWebView. Falling through after a cancel used to reject
 * again through the bridge and trip Next's dev overlay (`user-script`
 * / `returnResult`).
 */
export async function nativeShare(title: string, text: string, url: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, url });
  } catch {
    // "Share canceled", "already sharing", missing activity types, etc.
  }
  return true;
}

export async function nativeTurnHaptic(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // plugin missing or unavailable — the web ping still plays
  }
}
