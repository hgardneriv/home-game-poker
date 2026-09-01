import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNative, nativeShare, nativeTurnHaptic, onNativeAppActive } from './native';

const share = vi.fn();
const addListener = vi.fn();
const impact = vi.fn();

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

function stubNative() {
  vi.stubGlobal('window', {
    Capacitor: { isNativePlatform: () => true },
  });
}

describe('native bridges (web / node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    share.mockReset();
    addListener.mockReset();
    impact.mockReset();
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
});
