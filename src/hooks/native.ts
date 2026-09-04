/**
 * Optional Capacitor bridges. On the web these are no-ops so the same
 * bundle keeps working in the browser. Dynamic imports keep Next from
 * treating native plugins as required at SSR.
 */

export function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

/** Resume from background — iOS suspends the WebView and kills SSE. */
export async function onNativeAppActive(handler: () => void): Promise<() => void> {
  return onNativeAppState((isActive) => {
    if (isActive) handler();
  });
}

/** Foreground and background. Web no-op. */
export async function onNativeAppState(handler: (isActive: boolean) => void): Promise<() => void> {
  if (!isNative()) return () => {};
  try {
    const { App } = await import('@capacitor/app');
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      handler(isActive);
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

let presenceSeq = 0;
let foregroundAbort: AbortController | null = null;

function nextPresenceSeq(): number {
  presenceSeq += 1;
  return presenceSeq;
}

/** Looking at the table — skip turn-push while the app is in the foreground. */
export async function reportNativeForeground(gameId: string): Promise<void> {
  if (!isNative() || !gameId) return;
  const seq = nextPresenceSeq();
  foregroundAbort?.abort();
  const ac = new AbortController();
  foregroundAbort = ac;
  try {
    await fetch(`/api/games/${gameId}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: true, seq }),
      signal: ac.signal,
    });
  } catch {
    // aborted on swipe-away, or next action still works
  }
}

/** Not looking — clear presence and nudge APNs if it is already our turn. */
export async function reportNativeBackground(gameId: string): Promise<void> {
  if (!isNative() || !gameId) return;
  const seq = nextPresenceSeq();
  foregroundAbort?.abort();
  foregroundAbort = null;
  try {
    const res = await fetch(`/api/games/${gameId}/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: false, seq }),
    });
    console.info('push background', res.status, await res.text());
  } catch {
    // next turn-start still tries
  }
}

/** Xcode: last APNs attempt after coming back to the table. */
export async function logNativePushDebug(gameId: string): Promise<void> {
  if (!isNative() || !gameId) return;
  try {
    const res = await fetch(`/api/games/${gameId}/push`, { cache: 'no-store' });
    console.info('push debug', res.status, await res.text());
  } catch {
    // ignore
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

/**
 * Leave an in-app page (privacy, etc.) and land on `/`.
 * Next.js `<Link href="/">` is a client-side soft nav — on the iPhone
 * WKWebView that often does nothing, especially when the control sits
 * under the status bar. A full assign always unloads the page.
 */
export function leaveToAppHome(): void {
  if (typeof window === 'undefined') return;
  window.location.assign('/');
}

/** Hex APNs token from Capacitor — same check the register route uses. */
const DEVICE_TOKEN_RE = /^[0-9a-fA-F]{64,256}$/;

let pushHandlersAttached = false;
let pushGameId: string | null = null;
let openGameFromPush: ((gameId: string) => void) | null = null;

function gameIdFromPushData(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const raw = (data as { gameId?: unknown }).gameId;
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return id.length > 0 && id.length <= 32 ? id : null;
}

/**
 * Listen for APNs registration + notification taps. No-op on the web so
 * Safari never sees a permission prompt. Safe to call from the root layout
 * (cold start from a killed app) and again from the table.
 */
export async function attachNativePushHandlers(opts?: {
  onOpenGame?: (gameId: string) => void;
}): Promise<void> {
  if (opts?.onOpenGame) openGameFromPush = opts.onOpenGame;
  if (!isNative() || pushHandlersAttached) return;
  pushHandlersAttached = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.addListener('registration', (ev) => {
      const token = ev.value?.trim() ?? '';
      const gameId = pushGameId;
      if (!gameId || !DEVICE_TOKEN_RE.test(token)) return;
      void fetch(`/api/games/${gameId}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          console.info('push register', res.status, await res.text());
        })
        .catch((err) => {
          console.warn('push register failed', err);
        });
    });
    await PushNotifications.addListener('registrationError', () => {
      // permission granted but APNs failed — next sit retries register()
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const gameId = gameIdFromPushData(action.notification.data);
      if (gameId) openGameFromPush?.(gameId);
    });
  } catch {
    pushHandlersAttached = false;
  }
}

/**
 * Ask for notification permission (native only) and register this seat’s
 * device token against the existing cookie identity.
 */
export async function registerNativeTurnPush(gameId: string): Promise<void> {
  if (!isNative()) return;
  pushGameId = gameId;
  await attachNativePushHandlers();
  void reportNativeForeground(gameId);
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;
    await PushNotifications.register();
  } catch {
    // plugin missing — web bundle is unchanged
  }
}

export async function clearNativeTurnPush(gameId: string): Promise<void> {
  if (!isNative()) return;
  try {
    await fetch(`/api/games/${gameId}/push`, { method: 'DELETE' });
  } catch {
    // ignore — token TTL matches the table
  }
  if (pushGameId === gameId) pushGameId = null;
}

/** Test-only: reset module state between cases. */
export function resetNativePushForTests(): void {
  pushHandlersAttached = false;
  pushGameId = null;
  openGameFromPush = null;
  presenceSeq = 0;
  foregroundAbort = null;
}

export function openGamePath(gameId: string): string {
  return `/game/${gameId}`;
}
