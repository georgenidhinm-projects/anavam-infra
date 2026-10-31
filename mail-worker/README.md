# The bills mailbox worker

Cloudflare Email Routing on `in.anavamgroup.ca` sends every message to this Worker. A `bills-*` message becomes one signed HTTPS
POST to Nudge (`docs/nudge-bills-spec.md`); anything else on that address is dropped. Failures are kept in the `RETRY` KV store
and retried every minute on the spec's schedule for up to 24 hours, then deleted.

Two gaps against the spec, agreed with the Nudge project before going live: Cloudflare gives no spam score (`spam.score` is
null; failing senders and viruses are refused at the door), and a 401 alert is an error line in the Worker's logs (turn on
Cloudflare's email notification for Worker errors).

## Deploying with GitHub (the usual way)

Once the three repository secrets are set (see `.github/workflows/deploy.yml`), run Actions > Deploy > Run workflow. It tests
the worker, finds or creates the retry store, deploys, sets the shared secret, and publishes the website. Then turn on Email
Routing for `in` with a catch-all to `anavam-mail-worker` (step 5 below).

## Deploying by hand (once the domain is on Cloudflare)

1. In this folder: `npm install`, then `npx wrangler login` (opens Cloudflare in the browser).
2. `npx wrangler kv namespace create RETRY` and put the id it prints into `wrangler.toml`.
3. Make the shared secret on your own computer (`openssl rand -base64 32`) and set it, pasting it when asked:
   `npx wrangler secret put NUDGE_MAIL_SECRET`. Put the same value in Vercel → anavam-nudge → `NUDGE_MAIL_SECRET`, and set
   `NUDGE_MAIL_DOMAIN` to `in.anavamgroup.ca`. Never paste it anywhere else.
4. `npx wrangler deploy`.
5. In Cloudflare → anavamgroup.ca → Email → Email Routing: enable it for the subdomain `in`, then add a catch-all rule for
   `in.anavamgroup.ca` that sends to the Worker `anavam-mail-worker`.
6. Run the spec's checks: a test POST (`X-Nudge-Test: 1`), a wrong signature (401), an unknown address (dropped), a real bill.

Tests: `npm test` (Node 20 or newer).
