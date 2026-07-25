/* ClearScope website scan: connection switch.
   ---------------------------------------------------------------------------
   Leave the value BLANK until the Worker is deployed and verified. While it is
   blank, the scan page tells visitors the service is not available yet. It
   never invents findings.

   To turn the scan ON: deploy the Worker in /worker (see ACTIVATE-SITE-SCAN.md),
   then paste the URL that `wrangler deploy` prints, plus the /api/site-scan
   path, below:

     window.CLEAR_SCOPE_SITE_SCAN_API =
       "https://clearscope-creator-search.<your-subdomain>.workers.dev/api/site-scan";

   This file must load BEFORE the scan script. It already does in
   website-compliance-scan.html. */
window.CLEAR_SCOPE_SITE_SCAN_API =
  "https://clearscope-creator-search.clearscope-counsel-tools.workers.dev/api/site-scan";
