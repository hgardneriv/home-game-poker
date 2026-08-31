import { afterEach, describe, expect, it, vi } from 'vitest';
import { nativeShare, nativeTurnHaptic, onNativeAppActive } from './native';

const share = vi.fn();
vi.mock('@capacitor/share', () => ({
  Share: { share: (...args: unknown[]) => share(...args) },
}));

describe('native bridges (web / node)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    share.mockReset();
  });

  it('app-active, share, and haptic are no-ops without Capacitor', async () => {
    const detach = await onNativeAppActive(() => {
      throw new Error('should not fire');
    });
    detach();
    expect(await nativeShare('t', 'x', 'http://example.com')).toBe(false);
    expect(share).not.toHaveBeenCalled();
    await expect(nativeTurnHaptic()).resolves.toBeUndefined();
  });

  it('treats a cancelled native share as handled so web share is not also invoked', async () => {
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true },
    });
    share.mockRejectedValueOnce({ message: 'Share canceled' });
    expect(await nativeShare('t', 'x', 'http://example.com')).toBe(true);
    expect(share).toHaveBeenCalledWith({
      title: 't',
      text: 'x',
      url: 'http://example.com',
    });
  });
});
