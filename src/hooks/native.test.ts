import { describe, expect, it } from 'vitest';
import { nativeShare, nativeTurnHaptic, onNativeAppActive } from './native';

describe('native bridges (web / node)', () => {
  it('app-active, share, and haptic are no-ops without Capacitor', async () => {
    const detach = await onNativeAppActive(() => {
      throw new Error('should not fire');
    });
    detach();
    expect(await nativeShare('t', 'x', 'http://example.com')).toBe(false);
    await expect(nativeTurnHaptic()).resolves.toBeUndefined();
  });
});
