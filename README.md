# ClearScope Counsel Static Website

A responsive, accessible, flat-fee Missouri law practice website built with vanilla HTML, CSS, and JavaScript. No build step required, because not every website needs a dependency tree large enough to qualify as urban planning.

## What is included

- Homepage with premium/productized legal positioning
- Four service pages:
  - Missouri Estate Planning
  - Startup & Venture Counsel
  - Small Business General Counsel
  - FINRA / Securities Consulting
- Flat Fees page with the “old way” vs. modern legal practice positioning
- Resource library with five guide/checklist pages
- About page with founder bio/photo placeholder
- Contact / quote form with validation and demo submission behavior
- Privacy, terms, disclaimers, and Missouri advertising notice placeholders
- Adaptive light/dark theme toggle
- Mobile navigation and sticky mobile CTAs
- Accessible forms, skip link, focus states, reduced-motion support

## How to run locally

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## Before launch

1. Replace `ClearScope Counsel` with the final firm name if different.
2. Replace placeholder attorney bio and add professional headshots.
3. Connect forms to Formspree, HubSpot, Airtable, Netlify Forms, or a custom backend.
4. Add Calendly or Cal.com embed on `contact.html`.
5. Finalize privacy policy, terms, and legal disclaimers with Missouri ethics review.
6. Replace placeholder contact details.
7. Add analytics by uncommenting the Plausible script or installing GA4.
8. Run accessibility and performance checks before publishing.

## Suggested deployment

Static hosting works well:

- Netlify
- Vercel
- Cloudflare Pages
- GitHub Pages

For a richer future version, migrate the same IA and visual system into Astro, Next.js, or a CMS-backed setup.
