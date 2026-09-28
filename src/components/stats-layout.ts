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
