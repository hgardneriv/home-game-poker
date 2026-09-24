import Link from 'next/link';
import { HAND_KIND_LABELS, HAND_KINDS, rateTolerance } from '@/engine/hand-category';
import { PrivacyExit } from '@/components/PrivacyExit';
import { ShareLink } from '@/components/ShareLink';
import type { BotStats, HouseStats, PlayerStats, StatsSnapshot } from '@/server/stats';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function money(n: number): string {
  if (n > 0) return `+$${fmt(n)}`;
  if (n < 0) return `−$${fmt(-n)}`;
  return '$0';
}

function pct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

function MadeHands({
  hands,
  evaluated,
  expectedRates,
}: {
  hands: HouseStats['hands'];
  evaluated: number;
  expectedRates: StatsSnapshot['expectedRates'];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-current/10">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase opacity-60">
          <tr>
            <th className="px-3 py-2 font-medium">Hand</th>
            <th className="px-3 py-2 font-medium text-right">Count</th>
            <th className="px-3 py-2 font-medium text-right">Rate</th>
            <th className="px-3 py-2 font-medium text-right">Expected</th>
          </tr>
        </thead>
        <tbody>
          {HAND_KINDS.map((kind) => {
            const count = hands[kind];
            const rate = evaluated > 0 ? count / evaluated : 0;
            return (
              <tr key={kind} className="border-t border-current/10">
                <td className="px-3 py-1.5">{HAND_KIND_LABELS[kind]}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(count)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{evaluated ? pct(rate) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums opacity-70">
                  {pct(expectedRates[kind])}
                  <span className="ml-1 text-[10px] opacity-50">
                    ±{(rateTolerance(expectedRates[kind]) * 100).toFixed(2)}pp
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HouseBlock({ house, snapshot }: { house: HouseStats; snapshot: StatsSnapshot }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">House totals</h2>
      <p className="text-xs opacity-60">
        All tables, all time. Cards dealt = hole cards + board. Cards played = live
        hole cards + board (folded hole cards drop out). Made-hand rates are 7-card
        evaluations for every dealt player when the board runs to five — the same
        distribution as published Hold&apos;em frequencies.
      </p>
      <dl className="grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-xl border border-current/10 px-2 py-3">
          <dt className="text-xs opacity-60">Hands</dt>
          <dd className="text-xl font-semibold tabular-nums">{fmt(house.handsPlayed)}</dd>
        </div>
        <div className="rounded-xl border border-current/10 px-2 py-3">
          <dt className="text-xs opacity-60">Cards dealt</dt>
          <dd className="text-xl font-semibold tabular-nums">{fmt(house.cardsDealt)}</dd>
        </div>
        <div className="rounded-xl border border-current/10 px-2 py-3">
          <dt className="text-xs opacity-60">Cards played</dt>
          <dd className="text-xl font-semibold tabular-nums">{fmt(house.cardsPlayed)}</dd>
        </div>
      </dl>
      <MadeHands
        hands={house.hands}
        evaluated={house.handsEvaluated}
        expectedRates={snapshot.expectedRates}
      />
      <p className="text-xs opacity-50">Tolerance: {snapshot.toleranceNote}</p>
    </section>
  );
}

function BotList({ bots }: { bots: BotStats[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Bots</h2>
      <p className="text-xs opacity-60">Ranked by game wins. Open a bot for hand detail and calls.</p>
      {bots.length === 0 ? (
        <p className="text-sm opacity-60">No bot nights recorded yet.</p>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-current/10">
          {bots.map((bot, i) => (
            <li key={bot.slug} className="border-b border-current/10 last:border-b-0">
              <Link
                href={`/stats/bots/${bot.slug}`}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-current/5"
              >
                <span className="w-6 text-right opacity-50">{i + 1}</span>
                <span className="flex-1 truncate font-medium">{bot.name}</span>
                <span className="tabular-nums opacity-80">{fmt(bot.gameWins)} wins</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Leaderboard({ players }: { players: PlayerStats[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Players</h2>
      <p className="text-xs opacity-60">
        Top 15 by money. Same display name accumulates; a new name starts a
        row. No accounts. Seats that never took a card stay off the board.
      </p>
      {players.length === 0 ? (
        <p className="text-sm opacity-60">No human hands recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-current/10">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase opacity-60">
              <tr>
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 font-medium text-right">Games</th>
                <th className="px-3 py-2 font-medium text-right">Hands</th>
                <th className="px-3 py-2 font-medium text-right">Won</th>
                <th className="px-3 py-2 font-medium text-right">Folded</th>
                <th className="px-3 py-2 font-medium text-right">Calls</th>
                <th className="px-3 py-2 font-medium text-right">Money</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t border-current/10">
                  <td className="px-3 py-1.5 font-medium">{p.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.gamesPlayed)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.handsDealt)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.handsWon)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.handsFolded)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(p.calls)}</td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums ${
                      p.money > 0 ? 'text-emerald-600' : p.money < 0 ? 'text-red-500' : 'opacity-50'
                    }`}
                  >
                    {money(p.money)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StatsView({ snapshot }: { snapshot: StatsSnapshot }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 overflow-y-auto overscroll-contain px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-4">
        <PrivacyExit />
        <ShareLink />
      </div>
      <header>
        <h1 className="text-3xl font-bold">House stats</h1>
        <p className="mt-1 text-sm opacity-70">Play-money Texas Hold&apos;em — chips have no cash value.</p>
      </header>
      <HouseBlock house={snapshot.house} snapshot={snapshot} />
      <BotList bots={snapshot.bots} />
      <Leaderboard players={snapshot.players} />
    </main>
  );
}

export function BotStatsView({ bot, snapshot }: { bot: BotStats; snapshot: StatsSnapshot }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 overflow-y-auto overscroll-contain px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm opacity-70">
          <Link href="/stats" className="underline">
            All stats
          </Link>
        </p>
        <ShareLink />
      </div>
      <header>
        <h1 className="text-3xl font-bold">{bot.name}</h1>
        <p className="mt-1 text-sm opacity-70">
          {fmt(bot.gameWins)} game {bot.gameWins === 1 ? 'win' : 'wins'} · {fmt(bot.calls)}{' '}
          {bot.calls === 1 ? 'call' : 'calls'}
        </p>
      </header>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div className="rounded-xl border border-current/10 px-3 py-3">
          <dt className="text-xs opacity-60">Games</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(bot.gamesPlayed)}</dd>
        </div>
        <div className="rounded-xl border border-current/10 px-3 py-3">
          <dt className="text-xs opacity-60">Hands</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(bot.handsDealt)}</dd>
        </div>
        <div className="rounded-xl border border-current/10 px-3 py-3">
          <dt className="text-xs opacity-60">Hands won</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(bot.handsWon)}</dd>
        </div>
        <div className="rounded-xl border border-current/10 px-3 py-3">
          <dt className="text-xs opacity-60">Calls</dt>
          <dd className="text-lg font-semibold tabular-nums">{fmt(bot.calls)}</dd>
        </div>
      </dl>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Made hands</h2>
        <MadeHands
          hands={bot.hands}
          evaluated={bot.handsEvaluated}
          expectedRates={snapshot.expectedRates}
        />
        <p className="text-xs opacity-50">Tolerance: {snapshot.toleranceNote}</p>
      </section>
    </main>
  );
}
