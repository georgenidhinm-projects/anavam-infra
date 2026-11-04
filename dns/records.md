# DNS records for anavamgroup.com (main) and anavamgroup.ca (backup)

Every record we mean to have, by name and purpose. Values that are keys or verification codes (DKIM, provider checks) are
copied from the provider's own screen into Cloudflare, never written here. Status: planned until each is set and checked.
The old Zoho and Porkbun-forwarding mail records were deleted on 31 October 2026 (no mail was in use).

## anavamgroup.com (main: email and the website)

| Name | Type | Points to | Purpose | Status |
|---|---|---|---|---|
| anavamgroup.com | (Pages) | Cloudflare Pages project `anavam-site` (added by Pages > Custom domains) | public website (replaces Porkbun's parked page) | planned: `docs/website-go-live.md` |
| www | (Pages) + redirect rule | `anavam-site`, then 301 to https://anavamgroup.com, same path | website | planned: `docs/website-go-live.md` |
| anavamgroup.com | MX | Purelymail's mail servers (from Purelymail's screen) | people's mail | planned |
| anavamgroup.com | TXT | SPF from Purelymail's screen | people's mail | planned |
| (from Purelymail) | CNAME/TXT | DKIM records from Purelymail's screen | people's mail signing | planned |
| _dmarc | CNAME | Purelymail's DMARC record (from Purelymail's screen; Purelymail serves the policy) | mail reports. Cloudflare's "no DMARC" banner is a false alarm: don't add a TXT here | set |
| in | MX | Cloudflare Email Routing (added by Cloudflare when routing is enabled for the subdomain) | bills mailbox → Nudge | planned |
| send | (Resend) | Resend's MX, SPF and DKIM records for `send.anavamgroup.com` | mail the apps send | planned |
| desk | (Tunnel) | Cloudflare Tunnel to the Lenovo, behind Cloudflare Access | the Desk from the office | planned |

## anavamgroup.ca (backup)

| Name | Type | Points to | Purpose | Status |
|---|---|---|---|---|
| anavamgroup.ca, www | AAAA `100::`, proxied + redirect rule | 301 to https://anavamgroup.com, same path | one main name | planned: `docs/website-go-live.md` |
| anavamgroup.ca | MX, TXT | Purelymail's records for a second domain (from Purelymail's screen) | name@anavamgroup.ca reaches name@anavamgroup.com | planned |

## To delete (Porkbun parking, still present on 4 November 2026)

On anavamgroup.com: the three `A` records to `207.207.210.50`, `.23` and `.36`, and the `*` and `www` CNAMEs to
`uixie.porkbun.com`. On anavamgroup.ca: any similar Porkbun parking records. They cause the current 525 error.
