// The bills mailbox hand-off rules (src/core.mjs) and the worker (src/worker.mjs) against a stand-in Nudge and KV store
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { LIMITS, isBillsAddress, parseAuth, htmlToText, buildPayload, fitPayload, stripped, sign, nextAction, nextRetryAt, stableId } from '../src/core.mjs';
import worker, { deliver } from '../src/worker.mjs';

const raw = (extra = '') => [
  'From: ENMAX <billing@enmax.com>', 'To: bills-k3x9q2m7wa@in.anavamgroup.com', 'Reply-To: noreply@enmax.com',
  'Subject: Your ENMAX bill is ready', 'Date: Thu, 30 Oct 2026 12:44:10 -0600', 'Message-ID: <abc123@enmax.com>',
  'Authentication-Results: mx.cloudflare.net; spf=pass smtp.mailfrom=outlook.com; dkim=pass header.d=outlook.com; dmarc=pass header.from=enmax.com',
  'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', `Your bill of $84.12 is due November 20.${extra}`, ''].join('\r\n');

const headersOf = (text) => { const map = new Map(); for (const line of text.split('\r\n\r\n')[0].split('\r\n')) { const i = line.indexOf(':'); map.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()); } return { get: (k) => map.get(k.toLowerCase()) ?? null }; };
const message = (text, over = {}) => ({ to: 'bills-k3x9q2m7wa@in.anavamgroup.com', from: 'nidhin@example.com', raw: new Blob([text]).stream(), rawSize: text.length, headers: headersOf(text), setReject(r) { this.rejected = r; }, ...over });
const kv = () => { const m = new Map(); return { m, put: async (k, v) => m.set(k, v), get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), delete: async (k) => m.delete(k), list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }) }; };
const nudge = (answers) => { const calls = []; return { calls, fetch: async (url, init) => { calls.push({ url, init }); const a = answers.shift() ?? 200; return { status: a, headers: { get: (k) => (k === 'retry-after' && a === 429 ? '120' : null) } }; } }; };
const env = (store) => ({ NUDGE_URL: 'https://nudge.test/api/mail/inbound', NUDGE_MAIL_SECRET: 's'.repeat(40), RETRY: store });

test('addresses: only bills-<code>@domain', () => {
  assert.equal(isBillsAddress('bills-k3x9q2m7wa@in.anavamgroup.com'), true);
  assert.equal(isBillsAddress('nidhin@in.anavamgroup.com'), false);
  assert.equal(isBillsAddress('bills-@in.anavamgroup.com'), false);
});

test('auth verdicts and HTML to text', () => {
  assert.deepEqual(parseAuth('mx; spf=pass smtp.mailfrom=x.com; dkim=pass header.d=outlook.com; dmarc=fail'), { spf: 'pass', dkim: 'pass', dkimDomain: 'outlook.com', dmarc: 'fail' });
  assert.deepEqual(parseAuth(null), { spf: 'none', dkim: 'none', dkimDomain: null, dmarc: 'none' });
  assert.equal(htmlToText('<p>Bill &amp; due</p><script>x()</script><br>Now'), 'Bill & due\n\nNow');
});

test('the signature is HMAC-SHA256 of "<timestamp>.<body>" in hex, as Nudge checks it', async () => {
  const want = `v1=${createHmac('sha256', 'secret').update('1730000000.{"a":1}').digest('hex')}`;
  assert.equal(await sign('secret', 1730000000, '{"a":1}'), want);
});

test('the payload: PDFs carry content only up to 2 MB in all; the request fits in 4 MB, HTML trimmed first, the text never dropped', () => {
  const small = { filename: 'bill.pdf', mimeType: 'application/pdf', content: new Uint8Array(1000) };
  const big = { filename: 'big.pdf', mimeType: 'application/pdf', content: new Uint8Array(LIMITS.pdfTotal + 1) };
  const png = { filename: 'logo.png', mimeType: 'image/png', content: new Uint8Array(50) };
  const p = buildPayload({ text: 'hi', subject: 'S', from: { address: 'a@b.c', name: 'A' }, attachments: [small, png] }, { to: 'bills-x@in.a.ca', headers: { get: () => null }, receivedAt: 'T' });
  assert.ok(p.attachments[0].contentBase64); assert.equal(p.attachments[1].contentBase64, undefined); assert.equal(p.attachments[1].size, 50);
  const q = buildPayload({ text: 'hi', attachments: [small, big] }, { to: 'bills-x@in.a.ca', headers: { get: () => null }, receivedAt: 'T' });
  assert.ok(q.attachments.every((a) => !a.contentBase64), 'over 2 MB of PDFs: none carry content');
  assert.equal(q.spam.score, null);
  const huge = { ...p, html: 'x'.repeat(LIMITS.request), attachments: [{ filename: 'a.pdf', contentBase64: 'y'.repeat(LIMITS.request) }] };
  const f1 = fitPayload({ ...huge, attachments: [] }); assert.equal(f1.payload.html, null);
  const f2 = fitPayload(huge); assert.equal(f2.payload.html, null); assert.equal(f2.payload.attachments[0].contentBase64, undefined); assert.equal(f2.payload.text, 'hi');
  assert.equal(stripped(p).attachments[0].contentBase64, undefined);
});

test('answers and the retry schedule (1, 5, 30 minutes, 2 hours, then every 4 hours, up to 24 hours)', () => {
  assert.equal(nextAction(200).act, 'done'); assert.equal(nextAction(404).act, 'drop'); assert.equal(nextAction(401).act, 'alert');
  assert.equal(nextAction(413).act, 'strip'); assert.deepEqual(nextAction(429, '120'), { act: 'later', afterMin: 2 }); assert.equal(nextAction(503).act, 'retry'); assert.equal(nextAction(0).act, 'retry');
  const t0 = 0;
  assert.equal(nextRetryAt(1, t0, t0), 60e3); assert.equal(nextRetryAt(2, t0, t0), 5 * 60e3); assert.equal(nextRetryAt(4, t0, t0), 120 * 60e3); assert.equal(nextRetryAt(5, t0, t0), 240 * 60e3);
  assert.equal(nextRetryAt(9, t0, t0 + 21 * 3600e3), null, 'past 24 hours: give up');
});

test('a stable id when the message has none', async () => {
  const a = await stableId({ envelopeFrom: 'a', subject: 's', date: 'd', text: 't' });
  assert.equal(a, await stableId({ envelopeFrom: 'a', subject: 's', date: 'd', text: 't' })); assert.match(a, /^<sha256-[0-9a-f]{32}@anavam-mail-worker>$/);
});

test('end to end: a real email parsed and posted, signed, with the spec\'s fields', async () => {
  const store = kv(); const n = nudge([200]); const realFetch = globalThis.fetch; globalThis.fetch = n.fetch;
  try { await worker.email(message(raw()), env(store)); } finally { globalThis.fetch = realFetch; }
  assert.equal(n.calls.length, 1);
  const { init } = n.calls[0]; const body = JSON.parse(init.body);
  assert.equal(body.id, '<abc123@enmax.com>'); assert.equal(body.to, 'bills-k3x9q2m7wa@in.anavamgroup.com'); assert.equal(body.envelopeFrom, 'nidhin@example.com');
  assert.deepEqual(body.from, { address: 'billing@enmax.com', name: 'ENMAX' }); assert.equal(body.replyTo, 'noreply@enmax.com');
  assert.equal(body.subject, 'Your ENMAX bill is ready'); assert.match(body.text, /\$84\.12/); assert.deepEqual(body.auth, { spf: 'pass', dkim: 'pass', dkimDomain: 'outlook.com', dmarc: 'pass' });
  assert.equal(init.headers['X-Nudge-Signature'], await sign('s'.repeat(40), Number(init.headers['X-Nudge-Timestamp']), init.body));
  assert.equal(store.m.size, 0, 'nothing kept after a 200');
});

test('the worker: not a bills address is dropped, over 10 MB refused, 404 dropped, 5xx kept and retried, 413 retried once stripped', async () => {
  const realFetch = globalThis.fetch;
  try {
    let n = nudge([200]); globalThis.fetch = n.fetch;
    await worker.email(message(raw(), { to: 'someone@in.anavamgroup.com' }), env(kv())); assert.equal(n.calls.length, 0);
    const m = message(raw(), { rawSize: LIMITS.rejectOver + 1 }); await worker.email(m, env(kv())); assert.equal(m.rejected, 'Message too large');
    const store = kv(); n = nudge([404]); globalThis.fetch = n.fetch; await worker.email(message(raw()), env(store)); assert.equal(store.m.size, 0);
    n = nudge([503]); globalThis.fetch = n.fetch; await worker.email(message(raw()), env(store)); assert.equal(store.m.size, 1, 'kept for a retry');
    const [k] = store.m.keys(); const item = JSON.parse(store.m.get(k)); store.m.set(k, JSON.stringify({ ...item, nextAt: 0 }));
    n = nudge([200]); globalThis.fetch = n.fetch; await worker.scheduled({}, env(store)); assert.equal(n.calls.length, 1); assert.equal(store.m.size, 0, 'retried and delivered');
    n = nudge([413, 200]); const r = await deliver({ id: 'x', to: 'bills-a@in.a.ca', text: 't', html: '<p>t</p>', attachments: [{ filename: 'a.pdf', contentBase64: 'QQ==' }] }, env(kv()), n.fetch);
    assert.equal(r.act, 'done'); assert.equal(JSON.parse(n.calls[1].init.body).html, null); assert.equal(JSON.parse(n.calls[1].init.body).attachments[0].contentBase64, undefined);
  } finally { globalThis.fetch = realFetch; }
});
