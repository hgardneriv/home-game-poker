import { describe, expect, it } from 'vitest';
import { INVITE_SHARE_LEAD, INVITE_SHARE_TITLE, inviteSharePayload, inviteShareText } from './invite';

const TABLE_URL = 'https://holdem.pokerparty.app/game/abc123';

describe('invite share copy', () => {
  it('puts the ask first and the table URL after', () => {
    const text = inviteShareText(TABLE_URL);
    expect(text.startsWith(INVITE_SHARE_LEAD)).toBe(true);
    expect(text.endsWith(TABLE_URL)).toBe(true);
    expect(text.indexOf(INVITE_SHARE_LEAD)).toBeLessThan(text.indexOf(TABLE_URL));
    expect(text).toBe(`${INVITE_SHARE_LEAD}\n${TABLE_URL}`);
  });

  it('builds a share payload with no standalone url field', () => {
    const payload = inviteSharePayload(TABLE_URL);
    expect(payload).toEqual({
      title: INVITE_SHARE_TITLE,
      text: `${INVITE_SHARE_LEAD}\n${TABLE_URL}`,
    });
    expect(payload).not.toHaveProperty('url');
  });
});
