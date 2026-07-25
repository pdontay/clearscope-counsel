/* ClearScope creator search: connection switch.
   ---------------------------------------------------------------------------
   Leave the value BLANK to run the local curated-catalog keyword search
   (the page stays honest about that on its own).

   To turn ON live semantic search, deploy the Worker in /worker (see
   worker/DEPLOY.md), then paste its URL below. That is the only change needed:

     window.CLEAR_SCOPE_INFLUENCER_API =
       "https://clearscope-creator-search.<your-subdomain>.workers.dev/api/creator-search";

   This file must load BEFORE influencer-discovery.js. It already does in
   influencer-discovery.html. */
window.CLEAR_SCOPE_INFLUENCER_API = "";
