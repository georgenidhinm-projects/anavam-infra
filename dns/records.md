# DNS records for anavamgroup.ca (and .com)

Every record we mean to have, by name and purpose. Values that are keys or verification codes (DKIM, provider checks) are
copied from the provider's own screen into Cloudflare, never written here. Status: planned until each is set and checked.

## anavamgroup.ca

| Name | Type | Points to | Purpose | Status |
|---|---|---|---|---|
| anavamgroup.ca | (Pages) | Cloudflare Pages project `anavam-site` | public website | planned |
| www | CNAME | anavamgroup.ca | website | planned |
| anavamgroup.ca | MX | Purelymail's mail servers (from Purelymail's screen) | people's mail | planned |
| anavamgroup.ca | TXT | SPF from Purelymail (`v=spf1 include:_spf.purelymail.com ~all` or as shown) | people's mail | planned |
| (from Purelymail) | CNAME/TXT | DKIM records from Purelymail's screen | people's mail signing | planned |
| _dmarc | TXT | `v=DMARC1; p=none; rua=mailto:<the owner's address>` (start at none, later quarantine) | mail reports | planned |
| in | MX | Cloudflare Email Routing (added by Cloudflare when routing is enabled for the subdomain) | bills mailbox → Nudge | planned |
| send | (Resend) | Resend's MX, SPF and DKIM records for `send.anavamgroup.ca` | mail the apps send | planned |
| desk | (Tunnel) | Cloudflare Tunnel to the Lenovo, behind Cloudflare Access | the Desk from the office | planned |

## anavamgroup.com

| Name | Type | Points to | Purpose | Status |
|---|---|---|---|---|
| anavamgroup.com, www | (redirect rule) | https://anavamgroup.ca, same path | one main name | planned |
