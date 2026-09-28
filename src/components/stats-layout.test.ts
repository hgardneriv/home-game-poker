import { describe, expect, it } from 'vitest';
import {
  STATS_PAGE_MAIN_CLASS,
  STATS_TABLE_CLASS,
  STATS_TABLE_WRAP_CLASS,
} from './stats-layout';

describe('stats page overflow', () => {
  it('uses a bounded inner scrollport so Capacitor can scroll with WKWebView locked', () => {
    expect(STATS_PAGE_MAIN_CLASS.split(/\s+/)).toEqual(
      expect.arrayContaining(['h-dvh', 'max-h-dvh', 'overflow-y-auto', 'overscroll-contain', 'min-w-0']),
    );
    expect(STATS_PAGE_MAIN_CLASS).not.toMatch(/\bmin-h-dvh\b/);
    expect(STATS_PAGE_MAIN_CLASS).not.toMatch(/overflow-x-(?:auto|scroll)/);
  });

  it('does not put a nested scrollport on tables (wheel-steal / clip)', () => {
    expect(STATS_TABLE_WRAP_CLASS).not.toMatch(/overflow-/);
    expect(STATS_TABLE_CLASS).not.toMatch(/overflow-/);
    expect(STATS_TABLE_WRAP_CLASS.split(/\s+/)).toContain('min-w-0');
    expect(STATS_TABLE_CLASS.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-full', 'table-fixed']),
    );
  });

  it('does not add GPU-hostile filters on the stats table chrome', () => {
    for (const cls of [STATS_PAGE_MAIN_CLASS, STATS_TABLE_WRAP_CLASS, STATS_TABLE_CLASS]) {
      expect(cls).not.toMatch(/backdrop-filter|backdrop-blur|\bfilter\b/);
    }
  });
});
