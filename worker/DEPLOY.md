# Deploy the ClearScope tools Worker

This Worker supports both the influencer-discovery feature and the Startup
Website Compliance Scan. The creator search requires Gemini and Neon secrets.
The website scan uses public-page fetching and does not require an additional
secret.

## Before you start

- Node 20+ installed.
- Your **Gemini API key**.
- Your **Neon POOLED connection string**, the one whose host contains
  `-pooler` (not the direct host your Python scripts used). Workers talk to Neon
  over HTTP, and the pooled endpoint is the one that works.
- Confirm the embedding model in `src/index.js` (`CONFIG.embedModel`,
  `CONFIG.embedDim`) matches how you embedded the 206 rows. Default is
  `text-embedding-004` at 768 dims. If you used another model, change both.
- Confirm `CONFIG.table` / column names match your Neon schema.
- If you use a different production domain, add it to `ALLOWED_ORIGINS` in
  `src/index.js` before deploying. The Worker accepts browser calls only from
  the listed ClearScope domains.

## Steps

```bash
cd worker
npm install
npx wrangler login                       # opens the browser once to authorize

# Set the two secrets (prompts for the value; nothing is written to disk/toml):
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put DATABASE_URL      # paste the -pooler Neon string

npx wrangler deploy
```

`wrangler deploy` prints the live URL, e.g.
`https://clearscope-creator-search.<subdomain>.workers.dev`.

## Verify the backend ALONE before touching the site

curl sends no `Origin` header, so CORS can't interfere. This tests the Worker,
Gemini, and Neon as one chain:

```bash
curl -s -X POST \
  https://clearscope-creator-search.<subdomain>.workers.dev/api/creator-search \
  -H "Content-Type: application/json" \
  -d '{"query":"welder who does metal fabrication","limit":5}' | head -c 1200
```

You should get JSON with a `results` array. If a welding/metal creator such as
`@_west.weld_` ranks near the top, the whole chain works and any remaining
problem is on the page, not the backend.

Common failure points:
- Used the **direct** Neon string instead of the **pooled** (`-pooler`) one.
- Secrets set in `wrangler.toml` `[vars]` instead of via `wrangler secret put`.
- `CONFIG.embedDim` doesn't match the stored vectors (the Worker returns a clear
  dimension-mismatch error for this).

## Turn it on for the site

Open `../search-config.js` and set the one line to your live URL plus the path:

```js
window.CLEAR_SCOPE_INFLUENCER_API =
  "https://clearscope-creator-search.<subdomain>.workers.dev/api/creator-search";
```

Redeploy the static site. The page will now use the Worker, fall back to the
local list (labeled honestly) only if the Worker is slow or down.

Connect the website scan by opening `../site-scan-config.js` and setting:

```js
window.CLEAR_SCOPE_SITE_SCAN_API =
  "https://clearscope-creator-search.<subdomain>.workers.dev/api/site-scan";
```

Verify the scan endpoint before updating the static site:

```bash
curl -s -X POST \
  https://clearscope-creator-search.<subdomain>.workers.dev/api/site-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://clearscopecounsel.com/","maxPages":5}'
```

The response should include `pagesScanned`, `metrics`, and `findings`. The
endpoint accepts no more than five public same-site HTML pages and rejects
localhost, direct IP addresses, private-network targets, and off-site redirects.

Before public launch, add a Cloudflare rate-limiting rule for `/api/site-scan`.
The endpoint is intentionally secret-free, so CORS alone is not an abuse
control. For higher traffic, add Cloudflare Turnstile to the form and verify the
token in the Worker before starting the scan.

## Run it locally first (optional)

```bash
# create worker/.dev.vars (git-ignored) with:
#   GEMINI_API_KEY="..."
#   DATABASE_URL="...-pooler..."
npx wrangler dev        # serves on http://localhost:8787
```

Then temporarily point `../search-config.js` at
`http://localhost:8787/api/creator-search` to test the real widget end to end.
