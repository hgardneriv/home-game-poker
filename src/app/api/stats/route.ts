import { json } from '@/server/api';
import { readStatsSnapshot } from '@/server/stats';

export const dynamic = 'force-dynamic';

/** House totals, bot ranking, and the player leaderboard (cap 15). */
export async function GET(): Promise<Response> {
  return json(await readStatsSnapshot());
}
