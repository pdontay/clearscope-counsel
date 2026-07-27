# Deploying ClearScope Counsel

This is a **static site** — plain HTML, CSS, and JavaScript with no build step.
It can be hosted anywhere that serves static files. Below is the Hostinger path
(the method in the tutorial), plus free alternatives.

## Auto-deploy is now live (2026-07-27)

Every push to `main` (this repo, GitHub) triggers `.github/workflows/deploy.yml`,
which rsyncs the site straight into `domains/clearscopecounsel.com/public_html`
on the live Hostinger server over SSH. **Manual File Manager uploads are no
longer the normal path** — just commit and push to `main`.

- Auth is a dedicated SSH keypair (`clearscope-tracker-deploy`), stored as
  encrypted GitHub Actions secrets (`HOSTINGER_SSH_*`) on this repo. The
  matching public key lives under Hostinger → Advanced → SSH Access → SSH keys.
- The sync does **not** use `--delete` — removing a page from git won't remove
  it from the live server automatically. Retire a page by deleting it in the
  Hostinger File Manager directly if that's ever needed.
- `tracker-agent/`, `worker/`, and the root-level `.md` docs are excluded from
  the sync (not part of the deployed site).
- This is also the publish step the `tracker-agent/` regulatory tracker uses
  once you approve a draft by email.

---

## 1. Pre-flight — do these before going live

- [ ] **Add the two founder photos** to the `assets/` folder, named exactly:
  - `assets/founder-portrait.png` — the studio (gray-background) headshot
  - `assets/founder-office.png` — the office/desk photo
  *(The About page references these names. If they aren't present, those images
  show as broken on the live site.)*
- [x] **Contact form connected.** Wired to Formspree (form `xqeojron`); the resource
  "get the guides" form uses the same endpoint. Submit once on the live site and
  click Formspree's confirmation email to activate delivery.
- [ ] **Confirm the domain** (e.g., `clearscopecounsel.com`) and that the inbox
  `contact@clearscopecounsel.com` is set up with your email/domain provider.
- [ ] *(Optional)* Turn on analytics: uncomment the Plausible `<script>` line in
  each page's `<head>`, or paste in a GA4 snippet.

---

## Contact form (Formspree — connected)

Both the quote/contact form on `contact.html` and the "get the guides" form on
`resources.html` post to your Formspree form `xqeojron`
(endpoint `https://formspree.io/f/xqeojron`). Nothing else to wire. To finish:

1. In Formspree, confirm the form's destination email is set to
   **contact@clearscopecounsel.com** (or wherever you read mail).
2. Deploy, submit the form once on the live site, and click the one-time
   confirmation email Formspree sends. Inquiries then land in your inbox.

> Free tier handles ~50 submissions/month — plenty to start. With JavaScript off,
> the form still posts normally; with it on, the visitor stays on the page and sees
> a "thanks" message. A hidden honeypot field quietly filters spam bots.
>
> Prefer an actual database (the video's approach)? **Supabase** has a free tier —
> tell me and I'll swap the form to write rows into a Supabase table instead.

---

## 2. Deploy on Hostinger (matches the video)

1. Buy or log into a **Hostinger** plan and open **hPanel**.
2. Register or connect your **domain** in hPanel → **Domains**.
3. Go to hPanel → **Files → File Manager** and open the **`public_html`** folder.
4. Delete any default placeholder file Hostinger put there (e.g. `default.php`).
5. **Upload the contents of this project** into `public_html` — the *files*, not the
   wrapping folder. That means `index.html`, `styles.css`, `app.js`, and the
   `assets/` and `resources/` folders all sit directly inside `public_html`.
   *(Tip: zip the project, upload the `.zip`, then "Extract" inside File Manager.)*
6. Confirm `index.html` is directly inside `public_html` (it's the home page).
7. Point the domain to this hosting (hPanel → Domains, or update your registrar's
   nameservers to Hostinger's). DNS changes can take a few hours.
8. Visit your domain and click through every page.

> Hostinger also offers a Git-based deploy and an AI builder ("Horizons"). For this
> hand-built site, the File Manager upload above is the most direct route.

---

## 3. Free alternatives (also perfect for a static site)

- **Netlify** — drag-and-drop this folder at `app.netlify.com/drop`; live in seconds.
  Add your domain under Site settings → Domain management.
- **Cloudflare Pages / GitHub Pages / Vercel** — push this folder to a GitHub repo
  and connect it. No build command; output directory is the project root.

---

## 4. Post-deploy checklist

- [ ] About page: both founder photos load.
- [ ] All nav links and the four service pages open.
- [ ] Contact form behaves as intended (demo vs. connected backend).
- [ ] Privacy and Terms render; footer shows **ClearScope Counsel, LLC**, the
      address, and `contact@clearscopecounsel.com`.
- [ ] Mobile layout looks right; light/dark toggle works.

---

**Want me to handle any of these?** I can: wire the contact form to a real
backend/database, generate a ready-to-upload `.zip`, or produce the exact DNS
records for your domain. Just tell me which.
