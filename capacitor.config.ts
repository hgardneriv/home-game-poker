import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.homegame.poker',
  appName: 'Home Game Poker',
  webDir: 'public',
  server: {
    // BRANCH DEV ONLY — WKWebView loads local Next so this branch's UI can
    // be verified in the simulator before it exists on production.
    // Before merging iphone-app → master, restore:
    //   url: 'https://home-game-poker-kappa.vercel.app'
    //   (drop cleartext)
    // Simulator: http://localhost:3020 with `npx next dev -p 3020` running.
    // A physical device cannot use localhost; use the Mac's LAN IP instead.
    url: 'http://localhost:3020',
    cleartext: true,
    androidScheme: 'https',
  },
};

export default config;
