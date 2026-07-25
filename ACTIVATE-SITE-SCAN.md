# Activate the Website Compliance Scan

Four steps, in this order. Steps 1 and 4 need your Cloudflare and Hostinger
logins, so they have to run on your machine. Everything else is already done and
verified in the repo.

Current state: the scan page is live-ready but **switched off**. `site-scan-config.js`
is blank, so a visitor who runs a scan sees "The scan service is not available yet.
Please try again after launch." No fabricated findings, no broken UI.

---

## Step 1. Deploy the Worker

Open Terminal on your Mac:

```bash
cd "~/Downloads/clearscope-counsel-site Publish FINTechLegal/worker"
npm install
npx wrangler login          # opens the browser once
npx wrangler deploy
```

`wrangler deploy` prints the live URL. Copy it. It looks like:

```
https://clearscope-creator-search.<your-subdomain>.workers.dev
```

> The creator-search half of this Worker needs `GEMINI_API_KEY` and `DATABASE_URL`
> secrets. **The site scan does not.** If you only want the scan live now, deploy
> without setting them. The scan endpoint works; the creator-search endpoint
> returns an error until the secrets are set, and `search-config.js` is blank so
> nothing on the site calls it.

### Verify the Worker before touching the site

```bash
curl -s https://clearscope-creator-search.<your-subdomain>.workers.dev/
```

Expect: `{"ok":true,"service":"clearscope-tools","endpoints":[...]}`

Then the real thing:

```bash
curl -s -X POST \
  https://clearscope-creator-search.<your-subdomain>.workers.dev/api/site-scan \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/","maxPages":3}' | head -c 800
```

Expect JSON containing `pagesScanned`, `metrics`, and `findings`. If you get that,
the backend is sound and anything left is front-end wiring.

---

## Step 2. Confirm rate limiting

Mostly done already. `worker/wrangler.toml` carries a native Workers rate-limit
binding, and `src/index.js` enforces it per client IP before any scan starts:

```toml
[[ratelimits]]
name = "SITE_SCAN_RATE_LIMITER"
namespace_id = "19401"

  [ratelimits.simple]
  limit = 5
  period = 60
```

Five scans per IP per minute. Over the limit returns HTTP 429 with a plain
message and a `Retry-After` header. This ships automatically with `wrangler deploy`,
so there is nothing to click for it.

Confirm it works after deploying:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://clearscope-creator-search.<your-subdomain>.workers.dev/api/site-scan \
    -H "Content-Type: application/json" \
    -d '{"url":"https://example.com/","maxPages":1}'
done
```

The sixth call should print `429`.

**About a dashboard WAF rule:** Cloudflare's dashboard rate-limiting rules apply to
a *zone*, meaning a domain in your Cloudflare account. They cannot target a
`*.workers.dev` URL. If you want that second layer, put the Worker behind your own
domain first:

1. Add `clearscopecounsel.com` to Cloudflare (Websites, Add a site) and move your
   nameservers there.
2. In `wrangler.toml`, add a route so the Worker answers on your domain:
   ```toml
   [[routes]]
   pattern = "api.clearscopecounsel.com/*"
   custom_domain = true
   ```
3. Redeploy, then Security, WAF, Rate limiting rules, Create rule: match
   `URI Path equals /api/site-scan`, 10 requests per 1 minute per IP, action Block.
4. Point `site-scan-config.js` at `https://api.clearscopecounsel.com/api/site-scan`
   and add that origin to `ALLOWED_ORIGINS` if you change domains.

Until then, the in-Worker limiter is your abuse control, and it is a real one.

---

## Step 3. Turn the scan on

Open `site-scan-config.js` and set the one line to the URL from Step 1 plus the
path:

```js
window.CLEAR_SCOPE_SITE_SCAN_API =
  "https://clearscope-creator-search.<your-subdomain>.workers.dev/api/site-scan";
```

Save. That is the only change. Leave it blank if you want to upload the site now
and switch the feature on later.

---

## Step 4. Upload to Hostinger

Use `clearscope-site-upload.zip` (in this folder). It is the site only: no
`worker/`, no `node_modules`, no `.git`, no unused source images. 78 files, 19 MB.

1. hPanel, Files, File Manager, open `public_html`.
2. Delete any Hostinger placeholder file (`default.php`).
3. Upload `clearscope-site-upload.zip`, then right-click it and **Extract** in place.
4. Delete the `.zip` afterward.
5. Confirm `index.html` sits **directly** inside `public_html`, not in a subfolder.

### The one thing that will trip you up

The Worker only accepts browser requests from these origins:

```
https://clearscopecounsel.com
https://www.clearscopecounsel.com
```

So the scan will **not** work from a Hostinger temporary preview URL such as
`yourname.hostingersite.com`. It will fail with an origin error until the real
domain is pointed at the hosting. That is intended: it keeps the endpoint from
being used from arbitrary sites. If you want to test from a preview URL, add it
to `ALLOWED_ORIGINS` in `worker/src/index.js` and redeploy, then take it back out.

---

## Post-launch check

- [ ] `https://clearscopecounsel.com/website-compliance-scan.html` loads.
- [ ] Run a scan against your own site. Results show `pagesScanned`, metrics, findings.
- [ ] Run seven scans in a row. The later ones show the limit message, not an error page.
- [ ] Light and dark toggle both look right on the scan page.
- [ ] The page is reachable from Resources, and it is in `sitemap.xml`.

---

## What is already verified in this repo

- No broken asset or link references anywhere in the upload bundle (78 files checked).
- Blank config produces an honest unavailable message, never invented findings.
- The scan page has the pre-paint theme script, one `<h1>`, and a canonical tag.
- The Worker caps scans at 5 public same-site HTML pages and rejects localhost,
  raw IP addresses, private-network targets, and off-site redirects.
- `search-config.js` is blank, so the creator-search widget stays on its local
  catalog and says so.
