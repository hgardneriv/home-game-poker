/**
 * /stats overflow contract.
 *
 * Nested `overflow-x-auto` creates a scrollport (overflow-x:auto forces
 * overflow-y:auto). That box eats the wheel on desktop. On a phone, the
 * same wrapper grows with the table (`min-width: auto` in a flex column)
 * so the inner scroller never activates, then `html { overflow-x: hidden }`
 * clips the sides. Tables must fit; the document is the only scrollport.
 */
export const STATS_PAGE_MAIN_CLASS =
  'mx-auto flex min-h-dvh min-w-0 w-full max-w-2xl flex-col gap-8 px-6 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]';

export const STATS_TABLE_WRAP_CLASS = 'min-w-0 rounded-xl border border-current/10';

export const STATS_TABLE_CLASS = 'w-full table-fixed text-left text-sm';
