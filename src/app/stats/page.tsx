import type { Metadata } from 'next';
import { StatsView } from '@/components/StatsView';
import { maybeSeedDemoStats } from '@/server/stats-seed';
import { readStatsSnapshot } from '@/server/stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'House stats — Poker Party',
  description: 'All-time house totals, bot ranking, and player leaderboard.',
};

export default async function StatsPage() {
  await maybeSeedDemoStats();
  const snapshot = await readStatsSnapshot();
  return <StatsView snapshot={snapshot} />;
}
