import type { Metadata } from 'next';
import Link from 'next/link';
import { BotStatsView } from '@/components/StatsView';
import { PrivacyExit } from '@/components/PrivacyExit';
import { readBotStats, readStatsSnapshot } from '@/server/stats';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const bot = await readBotStats(slug);
  return {
    title: bot ? `${bot.name} — House stats` : 'Bot stats — Poker Party',
    description: bot
      ? `All-time hand stats and calls for ${bot.name}.`
      : 'Bot house stats.',
  };
}

export default async function BotStatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [bot, snapshot] = await Promise.all([readBotStats(slug), readStatsSnapshot()]);
  if (!bot) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-prose flex-col gap-6 px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))]">
        <PrivacyExit />
        <h1 className="text-3xl font-bold">No stats yet</h1>
        <p className="text-sm opacity-70">
          That bot hasn&apos;t recorded a night.{' '}
          <Link href="/stats" className="underline">
            Back to house stats
          </Link>
          .
        </p>
      </main>
    );
  }
  return <BotStatsView bot={bot} snapshot={snapshot} />;
}
