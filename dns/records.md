# DNS records for anavamgroup.com (main) and anavamgroup.ca (backup)

Every record we mean to have, by name and purpose. Values that are keys or verification codes (DKIM, provider checks) are
copied from the provider's own screen into Cloudflare, never written here. Status: planned until each is set and checked.
The old Zoho and Porkbun-forwarding mail records were deleted on 31 October 2026 (no mail was in use).

## anavamgroup.com (main: email and the website)

| Name | Type | Points to | Purpose | Status |
|---|---|---|---|---|
| anavamgroup.com | (Pages) | Cloudflare Pages project `anavam-site` | public website (replaces Porkbun's parked page) | planned |
| www | CNAME | anavamgroup.com | website | planned |
| anavamgroup.com | MX | Purelymail's mail servers (from Purelymail's screen) | people's mail | planned |
| anavamgroup.com | TXT | SPF from Purelymail's screen | people's mail | planned |
| (from Purelymail) | CNAME/TXT | DKIM records from Purelymail's screen | people's mail signing | planned |
| _dmarc | TXT | `v=DMARC1; p=none; rua=mailto:<the owner's address>` (start at none, later quarantine) | mail reports | planned |
| in | MX | Cloudflare Email Routing (added by Cloudflare when routing is enabled for the subdomain) | bills mailbox → Nudge | planned |
| send | (Resend) | Resend's MX, SPF and DKIM records for `send.anavamgroup.com` | mail the apps send | planned |
| desk | (Tunnel) | Cloudflare Tunnel to the Lenovo, behind Cloudflare Access | the Desk from the office | planned |

## anavamgroup.ca (backup)

| Name | Type | Points to | Purpose | Status |
|---|---|---|---|---|
| anavamgroup.ca, www | (redirect rule) | https://anavamgroup.com, same path | one main name | planned |
| anavamgroup.ca | MX, TXT | Purelymail's records for a second domain (from Purelymail's screen) | name@anavamgroup.ca reaches name@anavamgroup.com | planned |
