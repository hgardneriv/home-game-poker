import type { Metadata } from 'next';
import { StatsView } from '@/components/StatsView';
import { readStatsSnapshot } from '@/server/stats';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'House stats — Poker Party',
  description: 'All-time house totals, bot ranking, and player leaderboard.',
};

export default async function StatsPage() {
  const snapshot = await readStatsSnapshot();
  return <StatsView snapshot={snapshot} />;
}
