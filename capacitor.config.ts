import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pokerparty.holdem',
  appName: 'Poker Party',
  webDir: 'public',
  // Native WKWebView scrolling would pan the table. Safe areas are handled
  // in CSS (viewport-fit=cover + env(safe-area-inset-*)).
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
  },
  server: {
    // Phase 2 device proof + merge-gate target: WKWebView loads production.
    // A physical iPhone cannot reach this Mac's localhost.
    url: 'https://home-game-poker-kappa.vercel.app',
    androidScheme: 'https',
  },
};

export default config;
