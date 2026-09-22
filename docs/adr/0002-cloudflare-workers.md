# Cloudflare Workers as the deployment target

We deploy to Cloudflare Workers with Static Assets rather than Vercel, because Vercel's
Fair Use Guidelines restrict the Hobby plan to non-commercial personal use — naming
"any method of requesting or processing payment from visitors of the site" and "advertising
the sale of a product or service" as commercial usage — which makes this project ineligible
for it. The real comparison was therefore Vercel Pro at $20/month against Cloudflare's free
plan, on which this workload (two prerendered marketing pages, a three-screen authed area
and a webhook endpoint) sits comfortably and is expected to stay.

Within Cloudflare we chose Workers with Static Assets over Pages, following Cloudflare's own
guidance on the Pages documentation: "Start new projects with Workers." Pages is not
end-of-life and existing projects remain supported, but Workers carries the broader feature
set, including Cron Triggers, Workers Logs and the rate-limiting binding.

## Consequences

- **D1 is the single store**, including magic-link tokens and sessions. KV was rejected for
  auth state: the free plan allows 1,000 writes/day to distinct keys and is eventually
  consistent, which is wrong for single-use token invalidation.
- **10 ms CPU per request** on the free plan is a design constraint. Signature verification
  and token hashing use Web Crypto and stay lean.
- **Next.js is effectively off the table here.** Cloudflare's current default adapter is
  beta, and the mature alternative caps the worker at 3 MiB compressed on the free plan —
  which a Next.js bundle can exceed, forcing a paid upgrade for bundle headroom alone. This
  is the main reason the framework choice is Astro.
- **Email must be an HTTP API.** Workers cannot open SMTP connections.
