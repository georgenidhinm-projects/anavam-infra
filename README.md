# anavam-infra

The Anavam family's shared infrastructure: the anavamgroup.com domain (the main one, for email and the website) and
anavamgroup.ca (a backup that redirects and catches mail), the mail worker that hands bill
emails to Nudge, and the public website. The plan and the owner's step-by-step list are in the Drive Doc
"Anavam domains, email and website – action plan (30 October 2026)".

| Piece | Where it runs | Folder |
|---|---|---|
| DNS for both domains | Cloudflare (free) | `dns/records.md` |
| People's mailboxes | Purelymail (about US$10 a year) | `dns/records.md` |
| Bills mailbox → Nudge | Cloudflare Email Routing + Email Worker on `in.anavamgroup.com` (free) | `mail-worker/` |
| Mail the apps send | Resend on `send.anavamgroup.com` (free at our volume) | `dns/records.md` |
| Public website | Cloudflare Pages (free) | `site/` |
| The Desk from the office | Cloudflare Tunnel + Access on `desk.anavamgroup.com` (free) | the Desk's `docs/runner/` |

No secrets are kept here. See `CLAUDE.md` for the rules.
