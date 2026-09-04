import type { Metadata } from 'next';
import { PrivacyExit } from '@/components/PrivacyExit';

export const metadata: Metadata = {
  title: 'Privacy — Poker Party',
  description: 'How Poker Party handles session cookies and play-money chips.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex h-dvh max-w-prose flex-col gap-6 overflow-y-auto overscroll-contain px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <PrivacyExit />
      <h1 className="text-3xl font-bold">Privacy</h1>
      <p className="text-sm opacity-80">Last updated September 4, 2026.</p>

      <section className="space-y-3 text-sm leading-relaxed opacity-90">
        <p>
          Poker Party is play money only — chips have no cash value. There
          are no accounts, no real-money play, and we do not sell your data.
        </p>
        <h2 className="text-lg font-semibold">What we store</h2>
        <p>
          When you take a seat, the site sets an httpOnly cookie named{' '}
          <code className="text-xs">{'hg_{gameId}'}</code> so a refresh can restore
          that seat. The cookie is an HMAC of your per-game player id — not a
          login, email, or password. Game state (stacks, cards, actions) lives
          in Redis for about 24 hours and then expires.
        </p>
        <p>
          The browser may remember the display name you typed (
          <code className="text-xs">hg:playerName</code> in localStorage) so the
          next table can prefill it. You can clear that in the browser.
        </p>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <p>
          The website uses Vercel Analytics for aggregated page traffic. It is
          not used to identify you at a table.
        </p>
        <h2 className="text-lg font-semibold">iOS app</h2>
        <p>
          The iPhone app is a native shell around this same site. Share sheet
          and haptics stay on device. If you allow notifications, we store an
          Apple device token next to your seat cookie so we can send a “your
          turn” alert when the app is in the background. Tokens expire with
          the table (about 24 hours). Safari never asks for this permission.
          We do not use the camera, microphone, or photo library.
        </p>
        <h2 className="text-lg font-semibold">Contact</h2>
        <p>
          Questions about this policy:{' '}
          <a className="underline" href="mailto:homegamesupport@gmail.com">
            homegamesupport@gmail.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
