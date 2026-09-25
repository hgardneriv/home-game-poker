import { describe, expect, it } from 'vitest';
import {
  STATS_PAGE_MAIN_CLASS,
  STATS_TABLE_CLASS,
  STATS_TABLE_WRAP_CLASS,
} from './stats-layout';

const OVERFLOW_SCROLLPORTS =
  /overflow-(?:x|y)-(?:auto|scroll|hidden)|overscroll-contain/;

describe('stats page overflow', () => {
  it('uses the document as the only scrollport', () => {
    expect(STATS_PAGE_MAIN_CLASS).not.toMatch(OVERFLOW_SCROLLPORTS);
    expect(STATS_TABLE_WRAP_CLASS).not.toMatch(OVERFLOW_SCROLLPORTS);
    expect(STATS_TABLE_CLASS).not.toMatch(OVERFLOW_SCROLLPORTS);
  });

  it('lets flex children shrink so html overflow-x hidden cannot clip tables', () => {
    expect(STATS_PAGE_MAIN_CLASS.split(/\s+/)).toEqual(
      expect.arrayContaining(['min-w-0', 'w-full', 'max-w-2xl']),
    );
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
