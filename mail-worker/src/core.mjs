// The rules of the bills mailbox hand-off, kept free of Cloudflare so they can be tested in Node (test/core.test.mjs).
// The spec is Nudge's "Bills mailbox → Nudge" (docs/nudge-bills-spec.md): one signed HTTPS POST per message, size limits,
// answers and retries, and nothing kept or logged beyond time, id, recipient and Nudge's answer.

export const LIMITS = Object.freeze({
  rejectOver: 10 * 1024 * 1024, // refused at the door
  text: 100 * 1024, // characters of plain text kept
  html: 300 * 1024, // characters of HTML kept (optional)
  pdfTotal: 2 * 1024 * 1024, // PDF content included only while the PDFs add up to 2 MB or less
  request: 4 * 1024 * 1024, // the whole POST stays under 4 MB (Vercel allows 4.5)
});

// Retries for a 5xx or no answer: 1 minute, 5, 30, 2 hours, then every 4 hours, for up to 24 hours from the first try
export const RETRY = Object.freeze({ delaysMin: [1, 5, 30, 120], thenEveryMin: 240, giveUpHours: 24 });

// A bills address: bills-<code>@<domain>. Nudge decides whether the code exists; only the shape is checked here.
export const isBillsAddress = (to) => /^bills-[a-z0-9]{1,40}@[a-z0-9.-]+$/i.test(String(to || '').trim());

// SPF, DKIM and DMARC verdicts from the Authentication-Results header Cloudflare adds
export function parseAuth(header) {
  const h = String(header || '');
  const pick = (k) => { const m = new RegExp(`\\b${k}=([a-z]+)`, 'i').exec(h); return m ? m[1].toLowerCase() : 'none'; };
  const d = /\bdkim=[a-z]+[^;]*?\bheader\.(?:d|i)=@?([a-z0-9.-]+)/i.exec(h);
  return { spf: pick('spf'), dkim: pick('dkim'), dkimDomain: d ? d[1].toLowerCase() : null, dmarc: pick('dmarc') };
}

// HTML to plain text, for a message with no text part
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

const b64 = (bytes) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s); // eslint-disable-line no-undef
};
const sizeOf = (x) => (x == null ? 0 : typeof x === 'string' ? x.length : x.byteLength ?? x.length ?? 0);

// The JSON body for one recipient. parsed: postal-mime's result; to: the bills address; envelopeFrom; headers: a Headers-like
// object (get); receivedAt: ISO time
export function buildPayload(parsed, { to, envelopeFrom, headers, receivedAt }) {
  const hget = (k) => (headers && typeof headers.get === 'function' ? headers.get(k) : null);
  const html = parsed.html ? String(parsed.html) : null;
  const text = String(parsed.text || (html ? htmlToText(html) : '')).slice(0, LIMITS.text);
  const atts = parsed.attachments || [];
  const pdfs = atts.filter((a) => /pdf/i.test(a.mimeType || '') || /\.pdf$/i.test(a.filename || ''));
  const pdfTotal = pdfs.reduce((s, a) => s + sizeOf(a.content), 0);
  const withContent = pdfTotal <= LIMITS.pdfTotal;
  const id = parsed.messageId || hget('message-id') || null;
  return {
    id: id || null,
    to,
    receivedAt,
    envelopeFrom: envelopeFrom || null,
    from: parsed.from ? { address: parsed.from.address || null, name: parsed.from.name || null } : null,
    replyTo: Array.isArray(parsed.replyTo) && parsed.replyTo[0] ? parsed.replyTo[0].address || null : null,
    subject: parsed.subject || null,
    date: parsed.date || hget('date') || null,
    text,
    html: html ? html.slice(0, LIMITS.html) : null,
    auth: parseAuth(hget('authentication-results')),
    spam: { score: null, flagged: false }, // Cloudflare gives no spam score; failing senders and viruses are refused at the door
    attachments: atts.map((a) => {
      const isPdf = pdfs.includes(a);
      return { filename: a.filename || null, contentType: a.mimeType || null, size: sizeOf(a.content),
        ...(isPdf && withContent && a.content ? { contentBase64: b64(a.content) } : {}) };
    }),
  };
}

// A stable id when the message has no Message-ID: a hash of the sender, subject, date and text
export async function stableId(p) {
  const data = new TextEncoder().encode([p.envelopeFrom, p.subject, p.date, String(p.text || '').slice(0, 2000)].join('\n'));
  const h = await crypto.subtle.digest('SHA-256', data);
  return `<sha256-${[...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32)}@anavam-mail-worker>`;
}

// Keep the request under the limit: trim the HTML first, then drop attachment content; the text is never dropped
export function fitPayload(p, limit = LIMITS.request) {
  let body = JSON.stringify(p);
  if (body.length <= limit) return { payload: p, body };
  let q = { ...p, html: null };
  body = JSON.stringify(q);
  if (body.length <= limit) return { payload: q, body };
  q = { ...q, attachments: q.attachments.map(({ contentBase64, ...rest }) => rest) };
  body = JSON.stringify(q);
  return { payload: q, body };
}

// The stripped form for a 413: no HTML, no attachment content
export const stripped = (p) => ({ ...p, html: null, attachments: (p.attachments || []).map(({ contentBase64, ...rest }) => rest) });

// HMAC-SHA256 of "<timestamp>.<raw body>" with the shared secret, as "v1=<hex>"
export async function sign(secret, timestamp, body) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  return `v1=${[...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// What to do with Nudge's answer: done (200), drop (404), stop and alert (401), strip and retry once (413), later (429 with its
// Retry-After seconds), retry (5xx or no answer)
export function nextAction(status, retryAfter = null) {
  if (status === 200) return { act: 'done' };
  if (status === 404) return { act: 'drop' };
  if (status === 401) return { act: 'alert', why: 'Nudge refused the signature or timestamp (401): check NUDGE_MAIL_SECRET in both places' };
  if (status === 413) return { act: 'strip' };
  if (status === 429) { const s = Number(retryAfter); return { act: 'later', afterMin: Number.isFinite(s) && s > 0 ? Math.ceil(s / 60) : 60 }; }
  return { act: 'retry' };
}

// When the next retry is due after `attempts` failed tries since `firstAt` (ms); null once 24 hours have passed
export function nextRetryAt(attempts, firstAt, now = Date.now()) {
  const d = attempts - 1 < RETRY.delaysMin.length ? RETRY.delaysMin[attempts - 1] : RETRY.thenEveryMin;
  const at = now + d * 60e3;
  return at - firstAt > RETRY.giveUpHours * 3600e3 ? null : at;
}

// The one log line kept per answer: time, id, recipient and the answer, never text, subjects or attachments
export const logLine = ({ id, to, status, act }) => `${new Date().toISOString()} id=${id} to=${to} answer=${status} action=${act}`;
