import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pokerparty.holdem',
  appName: "Texas Hold'em",
  webDir: 'public',
  // Native WKWebView scrolling would pan the table. Safe areas are handled
  // in CSS (viewport-fit=cover + env(safe-area-inset-*)).
  ios: {
    contentInset: 'never',
    scrollEnabled: false,
  },
  server: {
    // Official host (DNS live 2026-09-04). Same Vercel project as the
    // kappa alias. A physical iPhone cannot reach this Mac's localhost.
    url: 'https://holdem.pokerparty.app',
    androidScheme: 'https',
  },
};

export default config;
