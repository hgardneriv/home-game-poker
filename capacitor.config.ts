import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.homegame.poker',
  appName: 'Home Game Poker',
  webDir: 'public',
  server: {
    // Phase 2 device proof + merge-gate target: WKWebView loads production.
    // A physical iPhone cannot reach this Mac's localhost.
    url: 'https://home-game-poker-kappa.vercel.app',
    androidScheme: 'https',
  },
};

export default config;
