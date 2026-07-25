/**
 * ClearScope creator search: Cloudflare Worker
 * -----------------------------------------------------------------------------
 * Why this exists: the browser cannot hold the Gemini API key or the Neon
 * password (View Source exposes anything shipped to the page), and browsers
 * cannot open raw Postgres connections. This Worker is the only thing that
 * touches those secrets. It:
 *
 *   1. Takes a POST { query, sector?, limit? } from the page.
 *   2. Turns the query into an embedding vector via Gemini.
 *   3. Runs a cosine-similarity search over your creators table in Neon.
 *   4. Returns { results: [...] } shaped for the page's normalizeApiCreator().
 *
 * Secrets (set with `wrangler secret put`, NEVER in wrangler.toml):
 *   - GEMINI_API_KEY   your Google AI Studio / Gemini key
 *   - DATABASE_URL     your Neon POOLED connection string (host contains
 *                      "-pooler"), the one that works over HTTP from Workers
 *
 * Assumptions you may need to adjust for your schema (see CONFIG below):
 *   - A table with an embedding column of pgvector type.
 *   - The embedding model + dimension match what you used to build the rows.
 */

import { neon } from "@neondatabase/serverless";

/* ----------------------------- CONFIG --------------------------------------
 * Change these to match the table you loaded your 206 rows into. The SELECT
 * returns snake_case columns; the page's normalizeApiCreator() already reads
 * both snake_case and camelCase, so these names are what to align with your DB.
 */
const CONFIG = {
  table: "creators",
  embeddingColumn: "embedding",
  // Columns returned to the page. Left side = your DB column, right side = alias.
  // Keep the aliases; the page maps them. Rename the left side to your columns.
  columns: [
    "name",
    "handle",
    "sector",
    "niche",
    "followers",
    "engagement_rate",
    "photo_url",
    "profile_url",
    "is_premier",
  ],
  sectorColumn: "sector", // used when the page sends a sector filter
  // Gemini embedding model + dimension. MUST match how the stored rows were
  // embedded, or cosine scores are meaningless.
  embedModel: "text-embedding-004",
  embedDim: 768,
  maxLimit: 24,
};

const ALLOWED_ORIGINS = new Set([
  "https://clearscopecounsel.com",
  "https://www.clearscopecounsel.com",
  // These local origins make end-to-end development possible without opening
  // the production API to arbitrary browser origins.
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:8000",
  "http://localhost:8000",
]);

const CORS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return null;
  return origin
    ? { ...CORS, "Access-Control-Allow-Origin": origin, Vary: "Origin" }
    : CORS;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(headers || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);
    if (request.method === "OPTIONS") {
      return cors
        ? new Response(null, { status: 204, headers: cors })
        : json({ error: "Origin not allowed." }, 403);
    }
    if (!cors) return json({ error: "Origin not allowed." }, 403);

    const url = new URL(request.url);
    // Health check: GET / returns ok so you can confirm the Worker is live.
    if (request.method === "GET" && url.pathname === "/") {
      return json(
        {
          ok: true,
          service: "clearscope-tools",
          endpoints: ["/api/creator-search", "/api/site-scan"],
        },
        200,
        cors,
      );
    }
    if (request.method === "POST" && url.pathname.endsWith("/site-scan")) {
      if (env.SITE_SCAN_RATE_LIMITER) {
        const clientKey =
          request.headers.get("CF-Connecting-IP") ||
          request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
          "anonymous";
        const { success } = await env.SITE_SCAN_RATE_LIMITER.limit({
          key: `site-scan:${clientKey}`,
        });
        if (!success) {
          return json(
            {
              error:
                "You have reached the scan limit. Please wait one minute and try again.",
            },
            429,
            {
              ...cors,
              "Retry-After": "60",
            },
          );
        }
      }
      return scanSite(request, cors);
    }
    if (request.method !== "POST" || !url.pathname.endsWith("/creator-search")) {
      return json({ error: "Not found" }, 404, cors);
    }

    if (!env.GEMINI_API_KEY || !env.DATABASE_URL) {
      return json(
        { error: "Server is missing GEMINI_API_KEY or DATABASE_URL secrets." },
        500,
        cors,
      );
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: "Body must be JSON." }, 400, cors);
    }

    const query = String(payload.query || "").trim();
    const sector = payload.sector ? String(payload.sector) : "";
    let limit = Number(payload.limit) || 12;
    if (limit < 1) limit = 1;
    if (limit > CONFIG.maxLimit) limit = CONFIG.maxLimit;

    if (!query) return json({ results: [] }, 200, cors);
    if (query.length > 300) {
      return json({ error: "Query must be 300 characters or fewer." }, 400, cors);
    }

    // 1) Embed the query with Gemini.
    let vector;
    try {
      vector = await embed(query, env.GEMINI_API_KEY);
    } catch (e) {
      return json({ error: "Embedding failed: " + e.message }, 502, cors);
    }
    if (!Array.isArray(vector) || vector.length !== CONFIG.embedDim) {
      return json(
        {
          error:
            "Embedding dimension " +
            (vector ? vector.length : "n/a") +
            " does not match CONFIG.embedDim " +
            CONFIG.embedDim +
            ". Set embedModel/embedDim to match your stored rows.",
        },
        500,
        cors,
      );
    }

    // 2) Cosine search in Neon. pgvector's <=> is cosine DISTANCE, so
    //    similarity score = 1 - distance, and we order by distance ascending.
    const vecLiteral = "[" + vector.join(",") + "]";
    const cols = CONFIG.columns.join(", ");
    const sql = neon(env.DATABASE_URL);

    let rows;
    try {
      if (sector) {
        rows = await sql`
          SELECT ${sql.unsafe(cols)},
                 1 - (${sql.unsafe(CONFIG.embeddingColumn)} <=> ${vecLiteral}::vector) AS score
          FROM ${sql.unsafe(CONFIG.table)}
          WHERE ${sql.unsafe(CONFIG.sectorColumn)} = ${sector}
          ORDER BY ${sql.unsafe(CONFIG.embeddingColumn)} <=> ${vecLiteral}::vector
          LIMIT ${limit}`;
      } else {
        rows = await sql`
          SELECT ${sql.unsafe(cols)},
                 1 - (${sql.unsafe(CONFIG.embeddingColumn)} <=> ${vecLiteral}::vector) AS score
          FROM ${sql.unsafe(CONFIG.table)}
          ORDER BY ${sql.unsafe(CONFIG.embeddingColumn)} <=> ${vecLiteral}::vector
          LIMIT ${limit}`;
      }
    } catch (e) {
      return json({ error: "Database query failed: " + e.message }, 502, cors);
    }

    return json({ query, count: rows.length, results: rows }, 200, cors);
  },
};

const SITE_SCAN = {
  maxPages: 5,
  maxHtmlBytes: 1_500_000,
  fetchTimeoutMs: 12_000,
};

const TRACKERS = [
  { name: "Google Analytics", test: /google-analytics\.com|googletagmanager\.com|gtag\s*\(/i },
  { name: "Meta Pixel", test: /connect\.facebook\.net|fbq\s*\(/i },
  { name: "Hotjar", test: /static\.hotjar\.com|hotjar\s*\(/i },
  { name: "Microsoft Clarity", test: /clarity\.ms|clarity\s*\(/i },
  { name: "TikTok Pixel", test: /analytics\.tiktok\.com|ttq\./i },
  { name: "LinkedIn Insight Tag", test: /snap\.licdn\.com|_linkedin_partner_id/i },
];

const REGULATORY_SOURCES = {
  "FTC Act Section 5": [
    {
      label: "FTC Act",
      url: "https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act",
    },
  ],
  TCPA: [
    {
      label: "47 CFR 64.1200",
      url: "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200",
    },
  ],
  "16 CFR Part 255": [
    {
      label: "FTC Endorsement Guides",
      url: "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255",
    },
  ],
  "16 CFR 465.4": [
    {
      label: "FTC Consumer Reviews Rule",
      url: "https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465/section-465.4",
    },
  ],
  "FTC Act Section 5 and MMPA": [
    {
      label: "FTC Act",
      url: "https://www.ftc.gov/legal-library/browse/statutes/federal-trade-commission-act",
    },
    {
      label: "RSMo 407.020",
      url: "https://www.revisor.mo.gov/main/OneSection.aspx?section=407.020",
    },
  ],
  "CAN-SPAM and MMPA identification": [
    {
      label: "FTC CAN-SPAM guidance",
      url: "https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business",
    },
    {
      label: "RSMo 407.020",
      url: "https://www.revisor.mo.gov/main/OneSection.aspx?section=407.020",
    },
  ],
};

const SCREENING_TYPES = {
  "Review practices": "Direct rule signal",
  Testimonials: "Context-dependent rule signal",
  "Phone capture": "Context-dependent rule signal",
  "Marketing claims": "Context-dependent substantiation signal",
  "Trackers vs. policy": "Conservative issue-spotting signal",
  "Privacy policy": "Conservative issue-spotting signal",
  "Email capture": "Conservative issue-spotting signal",
  "Business identity": "Conservative issue-spotting signal",
};

async function scanSite(request, cors) {
  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: "Body must be JSON." }, 400, cors);
  }

  let target;
  try {
    target = normalizeScanTarget(payload.url);
  } catch (e) {
    return json({ error: e.message }, 400, cors);
  }

  let maxPages = Number(payload.maxPages) || SITE_SCAN.maxPages;
  maxPages = Math.max(1, Math.min(SITE_SCAN.maxPages, maxPages));

  let first;
  try {
    first = await fetchPublicHtml(target);
  } catch (e) {
    return json({ error: e.message }, 422, cors);
  }

  const pages = [toPage(first)];
  const candidates = discoverInternalLinks(first.html, first.url);
  for (const candidate of candidates) {
    if (pages.length >= maxPages) break;
    try {
      const fetched = await fetchPublicHtml(candidate, first.url.origin);
      if (!pages.some((page) => page.url.href === fetched.url.href)) {
        pages.push(toPage(fetched));
      }
    } catch (e) {
      // A single inaccessible page should not prevent the public-page report.
    }
  }

  const findings = buildSiteFindings(pages);
  const categoryCount = new Set(findings.map((finding) => finding.category)).size;
  const humanReview = findings.filter(
    (finding) =>
      finding.severity === "review-first" ||
      finding.severity === "needs-context",
  ).length;

  return json(
    {
      domain: first.url.hostname.replace(/^www\./, ""),
      scannedUrl: first.url.href,
      pagesScanned: pages.length,
      pages: pages.map((page) => page.url.href),
      metrics: {
        observations: findings.length,
        categories: categoryCount,
        humanReview,
      },
      findings,
      generatedAt: new Date().toISOString(),
    },
    200,
    cors,
  );
}

function normalizeScanTarget(value) {
  let raw = String(value || "").trim();
  if (!raw) throw new Error("Enter a website address.");
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;

  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    throw new Error("Enter a valid public website address.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public HTTP and HTTPS websites can be scanned.");
  }
  if (url.username || url.password) {
    throw new Error("Website addresses with credentials are not accepted.");
  }
  assertPublicHostname(url.hostname);
  url.hash = "";
  return url;
}

function assertPublicHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    throw new Error("Only public websites can be scanned.");
  }

  if (host.includes(":")) {
    throw new Error("Direct IP addresses are not accepted.");
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return;
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => part > 255)) {
    throw new Error("Enter a valid public website address.");
  }
  const [a, b] = parts;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  ) {
    throw new Error("Direct private or reserved IP addresses are not accepted.");
  }
  throw new Error("Direct IP addresses are not accepted.");
}

async function fetchPublicHtml(input, requiredOrigin) {
  let url = input instanceof URL ? new URL(input.href) : new URL(input);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    assertPublicHostname(url.hostname);
    if (requiredOrigin && url.origin !== requiredOrigin) {
      throw new Error("The scan only follows pages on the submitted website.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SITE_SCAN.fetchTimeoutMs);
    let response;
    try {
      response = await fetch(url.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "ClearScope-Site-Review/1.0 (+https://clearscopecounsel.com/)",
        },
        signal: controller.signal,
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw new Error("The website took too long to respond.");
      }
      throw new Error("The website could not be reached.");
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location) throw new Error("The website returned an incomplete redirect.");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) {
      throw new Error("The website returned HTTP " + response.status + ".");
    }

    const contentType = response.headers.get("Content-Type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("The submitted address did not return an HTML page.");
    }
    const declaredLength = Number(response.headers.get("Content-Length")) || 0;
    if (declaredLength > SITE_SCAN.maxHtmlBytes) {
      throw new Error("The page is too large for this public-page scan.");
    }
    const html = (await response.text()).slice(0, SITE_SCAN.maxHtmlBytes);
    return { url, html };
  }
  throw new Error("The website redirected too many times.");
}

function toPage(fetched) {
  return {
    url: fetched.url,
    html: fetched.html,
    text: htmlToText(fetched.html),
  };
}

function discoverInternalLinks(html, baseUrl) {
  const urls = [];
  const seen = new Set([baseUrl.href]);
  const hrefPattern = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi;
  let match;
  while ((match = hrefPattern.exec(html)) && urls.length < 80) {
    const raw = decodeEntities(match[2]).trim();
    if (!raw || /^(#|mailto:|tel:|javascript:)/i.test(raw)) continue;
    try {
      const url = new URL(raw, baseUrl);
      url.hash = "";
      if (
        url.origin !== baseUrl.origin ||
        seen.has(url.href) ||
        /\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?)$/i.test(url.pathname)
      ) {
        continue;
      }
      seen.add(url.href);
      urls.push(url);
    } catch (e) {
      // Ignore malformed links.
    }
  }

  const priority = (url) => {
    const path = url.pathname.toLowerCase();
    if (/privacy/.test(path)) return 0;
    if (/terms|legal/.test(path)) return 1;
    if (/contact/.test(path)) return 2;
    if (/about/.test(path)) return 3;
    if (/testimonial|review/.test(path)) return 4;
    return 10;
  };
  return urls.sort((a, b) => priority(a) - priority(b));
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300_000);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function buildSiteFindings(pages) {
  const findings = [];
  const allHtml = pages.map((page) => page.html).join("\n");
  const allText = pages.map((page) => page.text).join(" ");
  const privacyPage = pages.find((page) => /privacy/i.test(page.url.pathname));
  const privacyText = privacyPage ? privacyPage.text.toLowerCase() : "";
  const trackers = TRACKERS.filter((tracker) => tracker.test.test(allHtml));
  const unnamedTrackers = trackers.filter(
    (tracker) => !privacyText.includes(tracker.name.toLowerCase().split(" ")[0]),
  );

  if (trackers.length && unnamedTrackers.length) {
    findings.push({
      category: "Trackers vs. policy",
      severity: "review-first",
      title: "Trackers appear to fire that the privacy policy does not name",
      summary:
        "A mismatch between observable tracking tools and published disclosures deserves prompt review under the FTC Act.",
      evidence:
        "Observed " +
        trackers.map((tracker) => tracker.name).join(", ") +
        ". The policy text did not clearly name " +
        unnamedTrackers.map((tracker) => tracker.name).join(", ") +
        ".",
      legalHook: "FTC Act Section 5",
    });
  }

  if (!privacyPage) {
    findings.push({
      category: "Privacy policy",
      severity: "review-first",
      title: "A reachable privacy policy was not found",
      summary:
        "The scan did not find a privacy-policy page among the public pages reviewed.",
      evidence: "No scanned internal link contained a privacy-policy path.",
      legalHook: "FTC Act Section 5",
    });
  } else {
    const hasDate =
      /\b(effective|updated|last revised|last updated)\b.{0,45}\b(20\d{2})\b/i.test(
        privacyPage.text,
      );
    const hasContact =
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bcontact us\b|\bprivacy questions\b/i.test(
        privacyPage.text,
      );
    if (!hasDate || !hasContact) {
      findings.push({
        category: "Privacy policy",
        severity: "worth-look",
        title: "The privacy policy is missing a maintenance signal",
        summary:
          "A visible date and a clear contact method help readers understand who owns the policy and whether it is current.",
        evidence:
          "The scanned policy did not clearly show " +
          [!hasDate ? "an effective or updated date" : "", !hasContact ? "a contact method" : ""]
            .filter(Boolean)
            .join(" or ") +
          ".",
        legalHook: "FTC Act Section 5",
      });
    }
  }

  const phonePages = pages.filter((page) =>
    /<input\b[^>]*\btype\s*=\s*["']?tel\b/i.test(page.html),
  );
  const phoneWithoutConsent = phonePages.filter(
    (page) =>
      !/consent|text message|message and data rates|not a condition|reply stop|sms/i.test(
        page.text,
      ),
  );
  if (phoneWithoutConsent.length) {
    findings.push({
      category: "Phone capture",
      severity: "review-first",
      title: "A phone field appears without nearby consent language",
      summary:
        "Phone capture used for marketing or automated texts can create TCPA exposure when the required consent language is missing.",
      evidence: "Phone input found on " + summarizePaths(phoneWithoutConsent) + ".",
      legalHook: "TCPA",
    });
  }

  const emailPages = pages.filter((page) =>
    /<input\b[^>]*\btype\s*=\s*["']?email\b/i.test(page.html),
  );
  const emailWithoutNotice = emailPages.filter(
    (page) =>
      !/privacy|how we use|marketing emails|newsletter|unsubscribe|consent/i.test(
        page.text,
      ),
  );
  if (emailWithoutNotice.length) {
    findings.push({
      category: "Email capture",
      severity: "worth-look",
      title: "An email field appears without a nearby use notice",
      summary:
        "A short statement describing how an address will be used can make the collection practice clearer.",
      evidence: "Email input found on " + summarizePaths(emailWithoutNotice) + ".",
      legalHook: "FTC Act Section 5",
    });
  }

  const testimonialPages = pages.filter((page) =>
    /\btestimonial(s)?\b|\bwhat (our )?(clients|customers) say\b|\bcustomer stor(y|ies)\b/i.test(
      page.text,
    ),
  );
  const testimonialWithoutDisclosure = testimonialPages.filter(
    (page) =>
      !/\bsponsored\b|\bpaid\b|\bgifted\b|\baffiliate\b|\bmaterial connection\b|\bad\b/i.test(
        page.text,
      ),
  );
  if (testimonialWithoutDisclosure.length) {
    findings.push({
      category: "Testimonials",
      severity: "worth-look",
      title: "Testimonials appear without disclosure vocabulary",
      summary:
        "If a reviewer received payment, gifts, or another material benefit, the connection may need a clear disclosure near the endorsement.",
      evidence:
        "Testimonial language appeared on " +
        summarizePaths(testimonialWithoutDisclosure) +
        ", without common disclosure terms.",
      legalHook: "16 CFR Part 255",
    });
  }

  const reviewIncentive = findExcerpt(
    allText,
    /\b(positive|five[- ]star|5[- ]star|good)\s+review\b|\b(discount|reward|gift|credit).{0,45}\breview\b/i,
  );
  if (reviewIncentive) {
    findings.push({
      category: "Review practices",
      severity: "review-first",
      title: "Review-incentive wording may be tied to sentiment",
      summary:
        "Incentives cannot be conditioned on a review expressing a particular sentiment.",
      evidence: reviewIncentive,
      legalHook: "16 CFR 465.4",
    });
  }

  const claims = collectMatches(
    allText,
    /\b(best|leading|number one|#1|guaranteed|risk[- ]free|clinically proven|cure[sd]?|double your|earn \$|make \$|results guaranteed)\b/gi,
  );
  if (claims.length) {
    findings.push({
      category: "Marketing claims",
      severity: "needs-context",
      title: "Marketing claims may need substantiation",
      summary:
        "The scan surfaced superlative, health, earnings, or outcome language. A scanner cannot determine whether the supporting evidence is adequate.",
      evidence: "Flagged terms: " + claims.slice(0, 8).join(", ") + ".",
      legalHook: "FTC Act Section 5 and MMPA",
    });
  }

  const addressPattern =
    /\b\d{1,6}\s+[a-z0-9 .'-]{2,45}\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|highway|hwy|way)\b.{0,90}\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/i;
  if (!addressPattern.test(allText)) {
    findings.push({
      category: "Business identity",
      severity: "quick-fix",
      title: "A physical postal address was not found",
      summary:
        "This is a weak signal by itself, but a business address can matter for commercial email and business identification.",
      evidence: "No physical street address was detected on the pages reviewed.",
      legalHook: "CAN-SPAM and MMPA identification",
    });
  }

  return findings.map((finding) => ({
    ...finding,
    screeningType:
      SCREENING_TYPES[finding.category] || "Conservative issue-spotting signal",
    legalSources: REGULATORY_SOURCES[finding.legalHook] || [],
  }));
}

function summarizePaths(pages) {
  return pages
    .slice(0, 3)
    .map((page) => page.url.pathname || "/")
    .join(", ");
}

function findExcerpt(text, pattern) {
  const match = String(text || "").match(pattern);
  if (!match) return "";
  const start = Math.max(0, match.index - 70);
  const end = Math.min(text.length, match.index + match[0].length + 90);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function collectMatches(text, pattern) {
  const values = [];
  let match;
  while ((match = pattern.exec(text)) && values.length < 12) {
    const value = match[0].toLowerCase();
    if (!values.includes(value)) values.push(value);
  }
  return values;
}

/**
 * Call Gemini's embeddings REST endpoint and return a plain number[] vector.
 */
async function embed(text, apiKey) {
  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    CONFIG.embedModel +
    ":embedContent?key=" +
    encodeURIComponent(apiKey);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/" + CONFIG.embedModel,
      content: { parts: [{ text: text }] },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error("Gemini " + res.status + ": " + detail.slice(0, 300));
  }
  const data = await res.json();
  return (data.embedding && data.embedding.values) || null;
}
