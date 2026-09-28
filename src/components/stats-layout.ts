/**
 * /stats overflow contract.
 *
 * Capacitor sets `ios.scrollEnabled: false` so the seated table cannot
 * pan. Document scroll therefore does nothing in the app (Safari is
 * fine). `/privacy` already scrolls inside `h-dvh overflow-y-auto`;
 * /stats must too. `min-h-dvh` grows with content and never becomes a
 * scrollport.
 *
 * Nested `overflow-x-auto` on tables is still forbidden: it eats the
 * desktop wheel and clips phones against `html { overflow-x: hidden }`.
 * Tables fit via `table-fixed` + `min-w-0`.
 */
export const STATS_PAGE_MAIN_CLASS =
  'mx-auto flex h-dvh max-h-dvh min-w-0 w-full max-w-2xl flex-col gap-8 overflow-y-auto overscroll-contain px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]';

export const STATS_TABLE_WRAP_CLASS = 'min-w-0 rounded-xl border border-current/10';

export const STATS_TABLE_CLASS = 'w-full table-fixed text-left text-sm';

/** Short headers so six player stats fit a ~390px card. `$` is money. */
export const STATS_PLAYER_STAT_LABELS = {
  games: 'Gms',
  hands: 'Hds',
  won: 'Won',
  folded: 'Fold',
  calls: 'Call',
  money: '$',
} as const;

export const STATS_PLAYER_STAT_TITLES = {
  games: 'Games',
  hands: 'Hands',
  won: 'Won',
  folded: 'Folded',
  calls: 'Calls',
  money: 'Money',
} as const;

export const STATS_PLAYER_CARD_GRID_CLASS =
  'mt-1 grid min-w-0 grid-cols-6 gap-x-1 text-center text-[11px] leading-tight opacity-70';
