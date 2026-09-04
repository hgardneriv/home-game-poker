import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachNativePushHandlers,
  clearNativeTurnPush,
  isNative,
  leaveToAppHome,
  nativeShare,
  nativeTurnHaptic,
  onNativeAppActive,
  openGamePath,
  registerNativeTurnPush,
  resetNativePushForTests,
} from './native';

const share = vi.fn();
const addListener = vi.fn();
const impact = vi.fn();
const checkPermissions = vi.fn();
const requestPermissions = vi.fn();
const register = vi.fn();
const pushAddListener = vi.fn();

vi.mock('@capacitor/share', () => ({
  Share: { share: (...args: unknown[]) => share(...args) },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: (...args: unknown[]) => addListener(...args) },
}));

vi.mock('@capacitor/haptics', () => ({
  ImpactStyle: { Medium: 'MEDIUM' },
  Haptics: { impact: (...args: unknown[]) => impact(...args) },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: (...args: unknown[]) => checkPermissions(...args),
    requestPermissions: (...args: unknown[]) => requestPermissions(...args),
    register: (...args: unknown[]) => register(...args),
    addListener: (...args: unknown[]) => pushAddListener(...args),
  },
}));

function stubNative() {
  vi.stubGlobal('window', {
    Capacitor: { isNativePlatform: () => true },
  });
}

describe('native bridges (web / node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetNativePushForTests();
    share.mockReset();
    addListener.mockReset();
    impact.mockReset();
    checkPermissions.mockReset();
    requestPermissions.mockReset();
    register.mockReset();
    pushAddListener.mockReset();
  });

  it('app-active, share, and haptic are no-ops without Capacitor', async () => {
    expect(isNative()).toBe(false);
    const detach = await onNativeAppActive(() => {
      throw new Error('should not fire');
    });
    detach();
    expect(addListener).not.toHaveBeenCalled();
    expect(await nativeShare('t', 'x', 'http://example.com')).toBe(false);
    expect(share).not.toHaveBeenCalled();
    await expect(nativeTurnHaptic()).resolves.toBeUndefined();
    expect(impact).not.toHaveBeenCalled();
  });

  it('treats a cancelled native share as handled so web share is not also invoked', async () => {
    stubNative();
    expect(isNative()).toBe(true);
    share.mockRejectedValueOnce({ message: 'Share canceled' });
    expect(await nativeShare('t', 'x', 'http://example.com')).toBe(true);
    expect(share).toHaveBeenCalledWith({
      title: 't',
      text: 'x',
      url: 'http://example.com',
    });
  });

  it('returns true after a successful native share', async () => {
    stubNative();
    share.mockResolvedValueOnce({ activityType: 'com.apple.UIKit.activity.CopyToPasteboard' });
    expect(await nativeShare('t', 'x', 'http://example.com')).toBe(true);
  });

  it('fires the resume handler only when the native app becomes active', async () => {
    stubNative();
    const remove = vi.fn();
    addListener.mockResolvedValueOnce({ remove });
    const handler = vi.fn();
    const detach = await onNativeAppActive(handler);
    expect(addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
    const cb = addListener.mock.calls[0][1] as (state: { isActive: boolean }) => void;
    cb({ isActive: false });
    expect(handler).not.toHaveBeenCalled();
    cb({ isActive: true });
    expect(handler).toHaveBeenCalledTimes(1);
    detach();
    expect(remove).toHaveBeenCalled();
  });

  it('no-ops when the App plugin cannot be subscribed', async () => {
    stubNative();
    addListener.mockRejectedValueOnce(new Error('plugin missing'));
    const detach = await onNativeAppActive(() => {
      throw new Error('should not fire');
    });
    detach();
  });

  it('fires a medium impact haptic on native', async () => {
    stubNative();
    impact.mockResolvedValueOnce(undefined);
    await nativeTurnHaptic();
    expect(impact).toHaveBeenCalledWith({ style: 'MEDIUM' });
  });

  it('swallows a missing Haptics plugin', async () => {
    stubNative();
    impact.mockRejectedValueOnce(new Error('plugin missing'));
    await expect(nativeTurnHaptic()).resolves.toBeUndefined();
  });

  it('leaveToAppHome assigns / so the WKWebView unloads the page', () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    leaveToAppHome();
    expect(assign).toHaveBeenCalledWith('/');
  });
});

describe('native turn-push (web / node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetNativePushForTests();
    checkPermissions.mockReset();
    requestPermissions.mockReset();
    register.mockReset();
    pushAddListener.mockReset();
  });

  it('never touches the Push plugin or permission APIs off native', async () => {
    await attachNativePushHandlers({ onOpenGame: () => {} });
    await registerNativeTurnPush('game1');
    await clearNativeTurnPush('game1');
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(pushAddListener).not.toHaveBeenCalled();
  });

  it('requests permission only when iOS reports prompt, then registers', async () => {
    stubNative();
    pushAddListener.mockResolvedValue({ remove: vi.fn() });
    checkPermissions.mockResolvedValueOnce({ receive: 'prompt' });
    requestPermissions.mockResolvedValueOnce({ receive: 'granted' });
    register.mockResolvedValueOnce(undefined);
    await registerNativeTurnPush('game1');
    expect(requestPermissions).toHaveBeenCalled();
    expect(register).toHaveBeenCalled();
  });

  it('does not prompt again when permission is already granted', async () => {
    stubNative();
    pushAddListener.mockResolvedValue({ remove: vi.fn() });
    checkPermissions.mockResolvedValueOnce({ receive: 'granted' });
    register.mockResolvedValueOnce(undefined);
    await registerNativeTurnPush('game1');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalled();
  });

  it('does not register when the player denies notifications', async () => {
    stubNative();
    pushAddListener.mockResolvedValue({ remove: vi.fn() });
    checkPermissions.mockResolvedValueOnce({ receive: 'denied' });
    await registerNativeTurnPush('game1');
    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('posts the APNs token to this game and opens the table on tap', async () => {
    stubNative();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const listeners = new Map<string, (ev: unknown) => void>();
    pushAddListener.mockImplementation(async (event: string, cb: (ev: unknown) => void) => {
      listeners.set(event, cb);
      return { remove: vi.fn() };
    });
    checkPermissions.mockResolvedValue({ receive: 'granted' });
    register.mockResolvedValue(undefined);

    const opened: string[] = [];
    await attachNativePushHandlers({ onOpenGame: (id) => opened.push(id) });
    await registerNativeTurnPush('game1');

    listeners.get('registration')?.({ value: 'ab'.repeat(32) });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/game1/push',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'ab'.repeat(32) }),
      })
    );

    listeners.get('pushNotificationActionPerformed')?.({
      notification: { data: { gameId: 'game1' } },
    });
    expect(opened).toEqual(['game1']);
    expect(openGamePath('game1')).toBe('/game/game1');
  });

  it('ignores a tap with no gameId', async () => {
    stubNative();
    const listeners = new Map<string, (ev: unknown) => void>();
    pushAddListener.mockImplementation(async (event: string, cb: (ev: unknown) => void) => {
      listeners.set(event, cb);
      return { remove: vi.fn() };
    });
    const opened = vi.fn();
    await attachNativePushHandlers({ onOpenGame: opened });
    listeners.get('pushNotificationActionPerformed')?.({ notification: { data: {} } });
    expect(opened).not.toHaveBeenCalled();
  });

  it('clears the stored token for this game on leave', async () => {
    stubNative();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await clearNativeTurnPush('game1');
    expect(fetchMock).toHaveBeenCalledWith('/api/games/game1/push', { method: 'DELETE' });
  });
});
