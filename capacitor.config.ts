import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.homegame.poker',
  appName: 'Home Game Poker',
  webDir: 'public',
  server: {
    // Path A: the native shell loads the live site so cookies, SSE, and
    // the existing UI transfer unchanged. WKWebView cookie persistence
    // still needs a real-device proof before we rely on it in the store.
    url: 'https://home-game-poker-kappa.vercel.app',
    androidScheme: 'https',
  },
};

export default config;
