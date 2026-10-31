// The Cloudflare Email Worker for in.anavamgroup.com: every bills-* message goes to Nudge as one signed HTTPS POST
// (docs/nudge-bills-spec.md). Settings: NUDGE_URL (a plain variable in wrangler.toml), NUDGE_MAIL_SECRET (a secret, set with
// `wrangler secret put`, never in this repository) and the RETRY KV store (messages waiting for a retry, 24 hours at most).
import PostalMime from 'postal-mime';
import { LIMITS, isBillsAddress, buildPayload, stableId, fitPayload, stripped, sign, nextAction, nextRetryAt, logLine } from './core.mjs';

const keyOf = (p) => `retry:${p.to}:${p.id}`;

// One POST to Nudge; returns { status, retryAfter }. A network failure or timeout counts as 0 (retried like a 5xx)
export async function post(payload, env, fetchImpl = fetch) {
  const { body } = fitPayload(payload);
  const ts = Math.floor(Date.now() / 1000);
  try {
    const res = await fetchImpl(env.NUDGE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Nudge-Timestamp': String(ts), 'X-Nudge-Signature': await sign(env.NUDGE_MAIL_SECRET, ts, body) },
      body,
      signal: AbortSignal.timeout(20000),
    });
    return { status: res.status, retryAfter: res.headers.get('retry-after') };
  } catch {
    return { status: 0, retryAfter: null };
  }
}

// Deliver once, following Nudge's answer; returns what happened. A 413 is retried once at once without HTML and attachments.
export async function deliver(payload, env, fetchImpl = fetch) {
  let r = await post(payload, env, fetchImpl);
  let a = nextAction(r.status, r.retryAfter);
  if (a.act === 'strip') { r = await post(stripped(payload), env, fetchImpl); a = nextAction(r.status, r.retryAfter); if (a.act === 'strip') a = { act: 'drop' }; }
  console.log(logLine({ id: payload.id, to: payload.to, status: r.status, act: a.act }));
  if (a.act === 'alert') console.error(`ALERT: ${a.why}`);
  return { status: r.status, ...a };
}

async function keepForRetry(env, payload, attempts, firstAt, afterMin = null) {
  const now = Date.now();
  const nextAt = afterMin ? now + afterMin * 60e3 : nextRetryAt(attempts, firstAt, now);
  if (!nextAt || nextAt - firstAt > 24 * 3600e3) { console.log(logLine({ id: payload.id, to: payload.to, status: 'gave-up', act: 'drop' })); await env.RETRY.delete(keyOf(payload)); return; }
  await env.RETRY.put(keyOf(payload), JSON.stringify({ payload, attempts, firstAt, nextAt }), { expirationTtl: 25 * 3600 });
}

export default {
  async email(message, env) {
    const to = String(message.to || '').toLowerCase();
    if (!isBillsAddress(to)) return; // anything else on this address is not Nudge's: accepted and dropped
    if (message.rawSize > LIMITS.rejectOver) { message.setReject('Message too large'); return; }
    const parsed = await PostalMime.parse(message.raw);
    const payload = buildPayload(parsed, { to, envelopeFrom: message.from, headers: message.headers, receivedAt: new Date().toISOString() });
    if (!payload.id) payload.id = await stableId(payload);
    const r = await deliver(payload, env);
    if (r.act === 'retry' || r.act === 'later') await keepForRetry(env, payload, 1, Date.now(), r.act === 'later' ? r.afterMin : null);
  },

  // A Cron Trigger every minute: retry what is due, delete on 200 or 404, give up after 24 hours
  async scheduled(event, env) {
    const now = Date.now();
    let cursor;
    do {
      const page = await env.RETRY.list({ prefix: 'retry:', cursor });
      for (const k of page.keys) {
        const item = await env.RETRY.get(k.name, 'json');
        if (!item || item.nextAt > now) continue;
        const r = await deliver(item.payload, env);
        if (r.act === 'retry' || r.act === 'later') await keepForRetry(env, item.payload, item.attempts + 1, item.firstAt, r.act === 'later' ? r.afterMin : null);
        else await env.RETRY.delete(k.name);
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  },
};
