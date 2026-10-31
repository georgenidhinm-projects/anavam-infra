# anavam-infra: notes for Claude

Shared infrastructure for the Anavam family's projects (the Desk, Nudge, the Ladder, the Islands, Family Challenge): the
domains and their DNS records, the inbound mail worker, and the public website. The plan behind it is the Drive Doc
"Anavam domains, email and website – action plan (30 October 2026)" in Anavam/Claude Research.

**Main domain: anavamgroup.com** (the owner, 31 October 2026: everyone's email and the website). anavamgroup.ca is the backup:
its website redirects to the .com, and mail to name@anavamgroup.ca reaches the same mailbox as name@anavamgroup.com.

## Standing rules (from the owner, Nidhin)

- Plain English, Canadian spelling, Calgary times (Alberta is on UTC-6 all year from 1 November 2026).
- **Never ask for, print or commit secrets.** No keys, tokens, passwords or shared secrets in this repository, in chat or in logs.
  Secrets live only in Cloudflare (Worker secrets, set with `wrangler secret put`) and in Vercel for the apps that share them.
  `dns/records.md` lists records by name and purpose; DKIM keys and verification codes are copied from the provider's screen
  into Cloudflare, never here.
- Every pull request says: what changed, how it was tested, whether any workflow file changed, and what he must do.
- Once tests pass, merge the pull request yourself and tell him in one line what changed.

## What's here

- `mail-worker/`: the Cloudflare Email Worker for `in.anavamgroup.com`. Every `bills-*` message goes to Nudge as one signed
  HTTPS POST, to the spec in `docs/nudge-bills-spec.md` (Nudge's own document; change it only with the Nudge project).
  `src/core.mjs` holds the rules (pure, tested in Node); `src/worker.mjs` the Cloudflare part. Tests: `npm test` in that folder.
  It never logs message text, subjects or attachments: only time, id, recipient and Nudge's answer.
- `site/`: the public one-page site for anavamgroup.com, on Cloudflare Pages. No trading, account or app details, nothing about
  the children.
- `dns/records.md`: every DNS record we mean to have, by name and purpose.

## Fragile things

- A domain's mail goes to one place: people's mail is Purelymail on `anavamgroup.com`; app mail is Cloudflare on
  `in.anavamgroup.com`; mail the apps send is Resend on `send.anavamgroup.com`. Never point two of them at the same name.
- Changing `NUDGE_MAIL_SECRET` means changing it in the Worker and in Vercel (anavam-nudge) at the same time.
- Moving a family app to a domain address resets things: Nudge's Face ID passkeys are tied to the address; Family
  Challenge's Google sign-in needs the address added; the iPads' Home Screen apps need adding again. One app at a time.
