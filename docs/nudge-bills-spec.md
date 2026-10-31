# Bills mailbox → Nudge: what the mail system needs to do

For the agent building the family's mail domain. Nudge (https://anavam-nudge.vercel.app) wants a "bills" mailbox:
grown-ups set an Outlook rule that sends bill emails to their own private Nudge address, the mail system hands each
email to Nudge over HTTPS, and Nudge turns it into a bill in that person's Personal list (or straight into the
grown-ups' shared Home, by rule). Times below are Calgary time where it matters.

## 1. Addresses

- One catch-all pattern on the domain: **`bills-<code>@<domain>`**. Nudge makes each grown-up's `<code>`
  (10 lowercase letters and digits, e.g. `bills-k3x9q2m7wa@<domain>`) and shows the address in that person's Settings.
  The mail system does not need a list of codes: it passes every `bills-*` message to Nudge, and Nudge decides.
- Anything else on the domain is the mail system's own business; Nudge only ever sees `bills-*`.
- If Nudge answers **404** (unknown or turned-off address), drop the message. Don't bounce it (that would confirm the
  address exists to a spammer) and don't retry.

## 2. Hand-off: one HTTPS POST per message

`POST https://anavam-nudge.vercel.app/api/mail/inbound`, `Content-Type: application/json`

Headers:
- `X-Nudge-Timestamp`: Unix seconds when sent.
- `X-Nudge-Signature`: `v1=` + hex HMAC-SHA256 of `"<timestamp>.<raw request body>"` with the shared secret.
  Nudge refuses a timestamp more than 5 minutes off, or a wrong signature (401, don't retry).
- `X-Nudge-Test: 1` (optional): Nudge checks the signature and address and answers `{"ok":true,"test":true}`
  without saving anything. Use it to prove the set-up.

Body (one message; if it has several `bills-*` recipients, send one POST per recipient):

```json
{
  "id": "<Message-ID header, or a stable hash if missing>",
  "to": "bills-k3x9q2m7wa@<domain>",
  "receivedAt": "2026-10-30T19:45:00Z",
  "envelopeFrom": "grown-up@outlook.com",
  "from": { "address": "billing@enmax.com", "name": "ENMAX" },
  "replyTo": "noreply@enmax.com",
  "subject": "Your ENMAX bill is ready",
  "date": "Thu, 30 Oct 2026 12:44:10 -0600",
  "text": "plain text of the message (if only HTML exists, the HTML turned into text), at most 100 KB",
  "html": "the HTML part, at most 300 KB, optional",
  "auth": { "spf": "pass", "dkim": "pass", "dkimDomain": "outlook.com", "dmarc": "pass" },
  "spam": { "score": 1.2, "flagged": false },
  "attachments": [
    { "filename": "bill.pdf", "contentType": "application/pdf", "size": 183422, "contentBase64": "..." }
  ]
}
```

- `from` is the message's own From header. For a forwarded message it is whoever forwarded it; Nudge digs the
  original sender out of the text, so no special handling is needed. (Outlook's "Redirect to" keeps the original
  From, so it's the better rule to use.)
- `auth`: the mail system's own SPF, DKIM and DMARC verdicts (`pass`, `fail`, `none`, …).
- **Attachments:** include `contentBase64` only for PDFs, and only while the attachments add up to 2 MB or less.
  List every other attachment (or any over the limit) with filename, type and size, but no content.
- **The whole request must stay under 4 MB** (Vercel's limit is 4.5 MB). Trim `html` first, then drop attachment
  content, never `text`.

## 3. Answers and retries

| Nudge answers | Meaning | Mail system does |
|---|---|---|
| 200 `{"ok":true,"id":…}` | Saved (or a repeat of an `id` already saved) | Done; delete its copy |
| 401 | Bad signature or old timestamp | Stop; alert whoever runs the mail system |
| 404 | Unknown or turned-off address | Drop silently |
| 413 | Too big | Retry once with `html` and attachment content removed |
| 429 | Too many for this address (more than 50 a day) | Retry after the `Retry-After` seconds |
| 5xx or no answer | Nudge is down | Retry at 1 min, 5 min, 30 min, 2 h, then every 4 h, for up to 24 h |

Nudge ignores a repeated `id` + `to`, so retries are always safe.

## 4. Filtering and safety, on the mail system's side

- Normal spam filtering. Don't send Nudge anything flagged as spam or carrying a virus.
- Reject at the door anything over 10 MB.
- Inbound mail over TLS where the sender offers it; the hand-off is HTTPS only.
- **Keep nothing longer than needed:** delete each message once Nudge answers 200 or 404 (at most 24 hours while
  retrying). Never log message text, subjects or attachments; log only time, `id`, recipient and Nudge's answer code.
- No copy of these messages in any other mailbox, archive or backup.

## 5. The shared secret

- One random secret, at least 32 characters (e.g. `openssl rand -base64 32`).
- It lives in two places only: the mail system's own secret store, and Vercel → anavam-nudge → Environment Variables
  as **`NUDGE_MAIL_SECRET`**. Never in code, chat, logs or a repository.
- Also in Vercel: **`NUDGE_MAIL_DOMAIN`** = the domain (not secret), so Nudge can show each person their address.
- Changing the secret means updating both places at once.

## 6. What Nudge does with it (for information; built on the Nudge side)

- Treats the email purely as data: Claude reads the text (and a PDF bill if there is one) to pull out the payee,
  amount, currency, due date and whether it repeats. Instructions written inside an email are never followed.
- Adds a Bill or Subscription to that person's Personal list, or straight to Home when they've set a rule for
  that sender ("always move ENMAX to Home").
- Keeps only those fields plus the sender's address and the subject. The email text and attachments are thrown
  away once read.
- Addresses are for grown-ups only. Each person can turn theirs off, or make a new one (the old one then gets 404).

## 7. How to check it works

1. Send a test POST with `X-Nudge-Test: 1`: expect 200 `{"ok":true,"test":true}`.
2. Send the same with a wrong signature: expect 401.
3. Send to `bills-doesnotexist@<domain>`: expect the mail system to drop it (Nudge says 404).
4. Email a real bill to the address: it should show in Personal within a minute.
