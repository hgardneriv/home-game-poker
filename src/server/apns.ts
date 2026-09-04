import { createPrivateKey, sign } from 'node:crypto';
import { connect, type ClientHttp2Session, type ClientHttp2Stream } from 'node:http2';

/**
 * Apple Push Notification service — token auth (.p8). Credentials come from
 * env only; never commit the key. New Apple keys are environment-specific
 * (Sandbox vs Production). Xcode Play / development builds need Sandbox.
 */

export const DEFAULT_APNS_BUNDLE_ID = 'app.pokerparty.holdem';

export interface ApnsResult {
  status: number;
  reason?: string;
  /** Drop the stored device token (Unregistered / BadDeviceToken / 410). */
  invalidate: boolean;
}

export interface ApnsSendInput {
  token: string;
  jwt: string;
  topic: string;
  production: boolean;
  payload: Record<string, unknown>;
}

export type ApnsSender = (input: ApnsSendInput) => Promise<ApnsResult>;

/** Only drop the *device* token — never on a bad provider JWT. */
const INVALID_REASONS = new Set(['BadDeviceToken', 'Unregistered']);

let senderOverride: ApnsSender | undefined;
let cachedJwt: { token: string; exp: number } | null = null;

export function setApnsSenderForTests(sender: ApnsSender | undefined): void {
  senderOverride = sender;
}

export function resetApnsJwtCache(): void {
  cachedJwt = null;
}

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_KEY);
}

export function apnsBundleId(): string {
  return process.env.APNS_BUNDLE_ID?.trim() || DEFAULT_APNS_BUNDLE_ID;
}

/** Production host only when explicitly opted in — first proof is an Xcode sandbox token. */
export function apnsProduction(): boolean {
  const v = process.env.APNS_PRODUCTION?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'prod' || v === 'production';
}

/** Accept real PEM or Vercel-style literal `\n` in a single-line env value. */
export function normalizeApnsKey(raw: string): string {
  const unescaped = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  return unescaped.trim();
}

export function buildApnsJwt(opts?: {
  keyId?: string;
  teamId?: string;
  key?: string;
  now?: number;
}): string {
  const keyId = opts?.keyId ?? process.env.APNS_KEY_ID ?? '';
  const teamId = opts?.teamId ?? process.env.APNS_TEAM_ID ?? '';
  const pem = normalizeApnsKey(opts?.key ?? process.env.APNS_KEY ?? '');
  if (!keyId || !teamId || !pem) throw new Error('APNs credentials missing');

  const iat = opts?.now ?? Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: teamId, iat })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(pem);
  const sig = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${sig.toString('base64url')}`;
}

export function apnsJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  // Apple requires refresh at least once an hour; cache ~50 minutes.
  if (cachedJwt && now < cachedJwt.exp) return cachedJwt.token;
  const token = buildApnsJwt({ now });
  cachedJwt = { token, exp: now + 50 * 60 };
  return token;
}

function hostFor(production: boolean): string {
  return production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
}

export function apnsShouldInvalidate(status: number, reason?: string): boolean {
  if (status === 410) return true;
  return Boolean(reason && INVALID_REASONS.has(reason));
}

export async function sendApnsHttp2(input: ApnsSendInput): Promise<ApnsResult> {
  const client: ClientHttp2Session = connect(hostFor(input.production));
  try {
    const body = JSON.stringify(input.payload);
    return await new Promise<ApnsResult>((resolve, reject) => {
      const req: ClientHttp2Stream = client.request({
        ':method': 'POST',
        ':path': `/3/device/${input.token}`,
        authorization: `bearer ${input.jwt}`,
        'apns-topic': input.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      const timer = setTimeout(() => {
        req.close();
        reject(new Error('APNs request timed out'));
      }, 8_000);
      let data = '';
      req.setEncoding('utf8');
      req.on('response', (headers) => {
        const status = Number(headers[':status'] ?? 0);
        req.on('data', (chunk) => {
          data += chunk;
        });
        req.on('end', () => {
          clearTimeout(timer);
          let reason: string | undefined;
          try {
            reason = (JSON.parse(data) as { reason?: string }).reason;
          } catch {
            // empty body on 200
          }
          resolve({ status, reason, invalidate: apnsShouldInvalidate(status, reason) });
        });
      });
      req.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      req.end(body);
    });
  } finally {
    client.close();
  }
}

export function turnPushPayload(gameId: string): Record<string, unknown> {
  return {
    aps: {
      alert: {
        title: 'Your turn',
        body: 'The table is waiting on you.',
      },
      sound: 'default',
    },
    gameId,
  };
}

export async function sendTurnAlert(token: string, gameId: string): Promise<ApnsResult> {
  const sender = senderOverride ?? sendApnsHttp2;
  const jwt = apnsJwt();
  const topic = apnsBundleId();
  const payload = turnPushPayload(gameId);
  const preferred = apnsProduction();
  const first = await sender({ token, jwt, topic, production: preferred, payload });
  // Xcode Play tokens are sandbox; a dual-env key can talk to either host.
  if (first.status === 200 || first.reason !== 'BadDeviceToken') return first;
  return sender({ token, jwt, topic, production: !preferred, payload });
}
