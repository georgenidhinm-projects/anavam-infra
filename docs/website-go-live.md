# Putting the website live on anavamgroup.com

The site is the `site/` folder of this repository: plain HTML and one stylesheet, no build step, no scripts, no trackers.
Cloudflare Pages serves it, with security headers from `site/_headers` and short paths from `site/_redirects`.

Today (4 November 2026) both domains show a Cloudflare **525** error, because the DNS still points at Porkbun's parking
page, which has no certificate for our names. The steps below fix that. About 15 minutes, all in the Cloudflare dashboard,
no keys or tokens to copy anywhere.

**Don't touch any mail record** while doing this: the MX, SPF (TXT), DKIM CNAMEs, `_dmarc` CNAME, `autoconfig`,
`autodiscover` SRV and the Purelymail ownership TXT all stay exactly as they are, on both domains.

## Step 1. Create the Pages project from GitHub

1. Go to <https://dash.cloudflare.com> and sign in.
2. Left menu: **Workers & Pages** (under *Compute*). Click **Create** (top right).
3. Choose the **Pages** tab, then **Import an existing Git repository** (labelled *Connect to Git* on some screens).
4. If asked, connect GitHub and allow Cloudflare to see the repository **anavam-infra** (only that one is needed).
5. Pick **anavam-infra** and click **Begin setup**.
6. Fill in:
   - **Project name:** `anavam-site`
   - **Production branch:** `main`
   - **Framework preset:** *None*
   - **Build command:** leave empty
   - **Build output directory:** `site`
   - Leave *Root directory* and *Environment variables* alone.
7. Click **Save and Deploy**. After about a minute it says *Success* and gives an address like `anavam-site.pages.dev`.
   Open it: you should see the Anavam Group page. (That address is kept out of search engines on purpose.)

From now on every merge to `main` updates the site by itself.

## Step 2. Remove Porkbun's parking records from anavamgroup.com

The site is already broken (525), so nothing is lost by doing this first, and it stops the next step from complaining.

1. Cloudflare dashboard → **anavamgroup.com** → **DNS** → **Records**.
2. Delete these five records, and only these (use **Edit** → **Delete** on each):
   - `A` `anavamgroup.com` → `207.207.210.50`
   - `A` `anavamgroup.com` → `207.207.210.23`
   - `A` `anavamgroup.com` → `207.207.210.36`
   - `CNAME` `*` (`*.anavamgroup.com`) → `uixie.porkbun.com`
   - `CNAME` `www` → `uixie.porkbun.com`

## Step 3. Point anavamgroup.com and www at the site

1. **Workers & Pages** → **anavam-site** → **Custom domains** tab → **Set up a custom domain**.
2. Type `anavamgroup.com` → **Continue** → **Activate domain**. Cloudflare adds the DNS record itself.
3. Again: **Set up a custom domain** → `www.anavamgroup.com` → **Continue** → **Activate domain**.
4. Each shows *Initializing*, then *Active*, usually within 5 minutes (it can take up to an hour while the certificate is issued).

## Step 4. Send www to the main address

So there is one address for the site, `https://anavamgroup.com`.

1. **anavamgroup.com** → **Rules** → **Overview** → **Create rule** → **Redirect Rule**
   (or pick the template **Redirect from WWW to root**, which fills in the same thing).
2. **Rule name:** `www to anavamgroup.com`
3. **If incoming requests match:** *Custom filter expression*, Field `Hostname`, Operator `equals`, Value `www.anavamgroup.com`.
4. **Then:** Type *Dynamic*, Expression `concat("https://anavamgroup.com", http.request.uri.path)`,
   Status code **301**, tick **Preserve query string**.
5. **Deploy**.

## Step 5. anavamgroup.ca → anavamgroup.com

A redirect rule only runs for names that go through Cloudflare (orange cloud), so the .ca needs a placeholder record.

1. **anavamgroup.ca** → **DNS** → **Records**. Delete any Porkbun parking records there (`A` records to `207.207.210.x`
   and `CNAME`s to `uixie.porkbun.com`, including `*` and `www`). Leave every mail record alone.
2. Add a record: Type `AAAA`, Name `@`, IPv6 address `100::`, Proxy status **Proxied** (orange cloud) → **Save**.
3. Add a record: Type `AAAA`, Name `www`, IPv6 address `100::`, Proxy status **Proxied** → **Save**.
   (`100::` is a "goes nowhere" address; Cloudflare answers before anything would reach it.)
4. **anavamgroup.ca** → **Rules** → **Overview** → **Create rule** → **Redirect Rule**.
5. **Rule name:** `anavamgroup.ca to anavamgroup.com`
6. **If incoming requests match:** **All incoming requests**.
7. **Then:** Type *Dynamic*, Expression `concat("https://anavamgroup.com", http.request.uri.path)`,
   Status code **301**, tick **Preserve query string** → **Deploy**.
8. Optional but tidy: **anavamgroup.ca** → **SSL/TLS** → **Edge Certificates** → turn on **Always Use HTTPS**.

## Step 6. Check it

Give it a few minutes, then in a private browser window:

- `https://anavamgroup.com` shows the site, with a padlock.
- `https://www.anavamgroup.com/privacy` lands on `https://anavamgroup.com/privacy`.
- `https://anavamgroup.ca/terms` and `http://www.anavamgroup.ca` land on `https://anavamgroup.com/...`.
- `https://anavamgroup.com/nothing-here` shows the *Page not found* page.
- Optional: <https://securityheaders.com> on `https://anavamgroup.com` should give an **A** or **A+**.
- Send yourself a test email to and from your anavamgroup.com address to confirm mail is untouched.

## About the DMARC banner in Cloudflare

Cloudflare may show a yellow banner on anavamgroup.com saying the domain has no DMARC record, or offering
**DMARC Management**. It's safe to ignore. Our DMARC lives at Purelymail: `_dmarc.anavamgroup.com` is a `CNAME` to
Purelymail, and Purelymail answers with the actual DMARC policy. Cloudflare's check only looks for a `TXT` record at that
name and doesn't follow the CNAME, so it reports it missing. Please **don't** add a `_dmarc` TXT record (a name can't have
both a CNAME and a TXT) and **don't** turn on Cloudflare's DMARC Management (it wants to replace the record). To confirm the
policy is live, use any DMARC checker (for example <https://mxtoolbox.com/dmarc.aspx>) on `anavamgroup.com`.

## The other way: the GitHub workflow

Instead of Step 1, the site can be published by `.github/workflows/deploy.yml` (Actions → Deploy → Run workflow → `site`).
That needs two repository secrets set once, in GitHub → anavam-infra → Settings → Secrets and variables → Actions:
`CLOUDFLARE_API_TOKEN` (a Cloudflare API token with *Cloudflare Pages: Edit*) and `CLOUDFLARE_ACCOUNT_ID`. Steps 2 to 6
are the same. Use one way or the other, not both: a Pages project connected to Git updates itself on every merge and doesn't
need the workflow's site step.

## Security notes

- `site/_headers` sets: a strict Content Security Policy (only our own stylesheet and images; no scripts, frames or forms),
  `frame-ancestors 'none'`, HSTS for one year, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, a `Permissions-Policy`
  that turns off camera, microphone, location and the rest, and cross-origin isolation headers.
- HSTS is deliberately for `anavamgroup.com` only (no `includeSubDomains`, no preload list) so it can't affect mail or app
  names such as `in`, `send`, `autoconfig` or `desk`. It can be widened later once every subdomain is known to be HTTPS.
- If a future page needs a script or an outside resource, the CSP in `site/_headers` must be changed in the same pull request.
