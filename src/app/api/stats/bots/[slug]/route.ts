import { json } from '@/server/api';
import { maybeSeedDemoStats } from '@/server/stats-seed';
import { readBotStats } from '@/server/stats';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params;
  await maybeSeedDemoStats();
  const bot = await readBotStats(slug);
  if (!bot) return json({ error: { code: 'not-found', message: 'No stats for that bot' } }, 404);
  return json({ bot });
}
