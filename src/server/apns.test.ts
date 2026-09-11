import { createPrivateKey, generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apnsBundleId,
  apnsConfigured,
  apnsJwt,
  apnsProduction,
  apnsShouldInvalidate,
  buildApnsJwt,
  DEFAULT_APNS_BUNDLE_ID,
  normalizeApnsKey,
  resetApnsJwtCache,
  sendTurnAlert,
  setApnsSenderForTests,
  turnPushPayload,
} from './apns';

function testPem(): string {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
}

afterEach(() => {
  setApnsSenderForTests(undefined);
  resetApnsJwtCache();
  vi.unstubAllEnvs();
});

describe('APNs env helpers', () => {
  it('is unconfigured without the three secrets and configured when all are set', () => {
    vi.stubEnv('APNS_KEY_ID', '');
    vi.stubEnv('APNS_TEAM_ID', '');
    vi.stubEnv('APNS_KEY', '');
    expect(apnsConfigured()).toBe(false);
    vi.stubEnv('APNS_KEY_ID', 'K');
    vi.stubEnv('APNS_TEAM_ID', 'T');
    vi.stubEnv('APNS_KEY', 'pem');
    expect(apnsConfigured()).toBe(true);
  });

  it('invalidates 410 and Apple’s dead-token reasons', () => {
    expect(apnsShouldInvalidate(200)).toBe(false);
    expect(apnsShouldInvalidate(400, 'BadCollapseId')).toBe(false);
    expect(apnsShouldInvalidate(410)).toBe(true);
    expect(apnsShouldInvalidate(400, 'BadDeviceToken')).toBe(true);
    expect(apnsShouldInvalidate(400, 'Unregistered')).toBe(true);
    expect(apnsShouldInvalidate(403, 'InvalidProviderToken')).toBe(false);
  });

  it('defaults to the Hold’em bundle id and sandbox host', () => {
    vi.stubEnv('APNS_BUNDLE_ID', '');
    vi.stubEnv('APNS_PRODUCTION', '');
    expect(apnsBundleId()).toBe(DEFAULT_APNS_BUNDLE_ID);
    expect(apnsProduction()).toBe(false);
  });

  it('treats 1 / true / production as the production host', () => {
    vi.stubEnv('APNS_PRODUCTION', '1');
    expect(apnsProduction()).toBe(true);
    vi.stubEnv('APNS_PRODUCTION', 'true');
    expect(apnsProduction()).toBe(true);
    vi.stubEnv('APNS_PRODUCTION', 'production');
    expect(apnsProduction()).toBe(true);
    vi.stubEnv('APNS_PRODUCTION', 'sandbox');
    expect(apnsProduction()).toBe(false);
  });

  it('rewrites Vercel-style literal newlines in the .p8', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----';
    expect(normalizeApnsKey(pem.replace(/\n/g, '\\n'))).toBe(pem);
  });
});

describe('APNs JWT', () => {
  it('signs ES256 with the key id and team id in the token', () => {
    const pem = testPem();
    const token = buildApnsJwt({
      keyId: 'KEYID1234',
      teamId: 'TEAMID1234',
      key: pem,
      now: 1_700_000_000,
    });
    const [h, p, s] = token.split('.');
    expect(JSON.parse(Buffer.from(h!, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEYID1234',
    });
    expect(JSON.parse(Buffer.from(p!, 'base64url').toString())).toEqual({
      iss: 'TEAMID1234',
      iat: 1_700_000_000,
    });
    const priv = createPrivateKey(pem);
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: priv, dsaEncoding: 'ieee-p1363' },
      Buffer.from(s!, 'base64url')
    );
    expect(ok).toBe(true);
  });

  it('caches the JWT across calls inside the hour', () => {
    const pem = testPem();
    vi.stubEnv('APNS_KEY_ID', 'KEYID1234');
    vi.stubEnv('APNS_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('APNS_KEY', pem);
    const a = apnsJwt();
    const b = apnsJwt();
    expect(a).toBe(b);
  });
});

describe('turn alert payload + send', () => {
  it('puts gameId in the custom payload next to the alert', () => {
    expect(turnPushPayload('abc')).toMatchObject({
      aps: { alert: { title: 'Your turn' }, sound: 'default' },
      gameId: 'abc',
    });
  });

  it('uses the injected sender and reports invalidate on 410', async () => {
    const pem = testPem();
    vi.stubEnv('APNS_KEY_ID', 'KEYID1234');
    vi.stubEnv('APNS_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('APNS_KEY', pem);
    const sender = vi.fn(async () => ({ status: 410, reason: 'Unregistered', invalidate: true }));
    setApnsSenderForTests(sender);
    const result = await sendTurnAlert('f'.repeat(64), 'game1');
    expect(result.invalidate).toBe(true);
    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'f'.repeat(64),
        topic: DEFAULT_APNS_BUNDLE_ID,
        production: false,
        payload: expect.objectContaining({ gameId: 'game1' }),
      })
    );
  });

  it('retries the other APNs host when the first returns BadDeviceToken', async () => {
    const pem = testPem();
    vi.stubEnv('APNS_KEY_ID', 'KEYID1234');
    vi.stubEnv('APNS_TEAM_ID', 'TEAMID1234');
    vi.stubEnv('APNS_KEY', pem);
    const sender = vi
      .fn()
      .mockResolvedValueOnce({ status: 400, reason: 'BadDeviceToken', invalidate: true })
      .mockResolvedValueOnce({ status: 200, invalidate: false });
    setApnsSenderForTests(sender);
    const result = await sendTurnAlert('f'.repeat(64), 'game1');
    expect(result.status).toBe(200);
    expect(sender).toHaveBeenCalledTimes(2);
    expect(sender.mock.calls[0][0]).toEqual(expect.objectContaining({ production: false }));
    expect(sender.mock.calls[1][0]).toEqual(expect.objectContaining({ production: true }));
  });

  it('does not treat a bad provider JWT as a dead device token', () => {
    expect(apnsShouldInvalidate(403, 'InvalidProviderToken')).toBe(false);
    expect(apnsShouldInvalidate(403, 'ExpiredProviderToken')).toBe(false);
  });
});
