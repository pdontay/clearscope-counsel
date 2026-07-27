import json
import re
from pathlib import Path

# Pages that render the full, unbounded tracker grid get the entries embedded
# directly in the page as a <script type="application/json"> block. Without
# this, the grid starts as a tiny "Loading…" placeholder and swaps to a
# multi-thousand-pixel grid once assets/tracker-entries.json finishes
# fetching — an input-independent layout shift that PageSpeed flagged as a
# ~0.5-1.0 CLS (very poor). Embedding the data lets tracker.js render
# synchronously on load, before the page's first paint, so the placeholder
# is never actually shown. Pages that only embed a filtered slice (e.g. the
# 3-entry previews on finra-securities.html/startup-counsel.html) keep using
# the fetch() fallback in tracker.js — their delta is small enough not to be
# worth the added sync surface here.
EMBED_PAGES = ["regulatory-watch.html"]

_BLOCK_RE = re.compile(
    r'(?:<script type="application/json" id="tracker-data">.*?</script>\s*)?'
    r'<script defer src="assets/tracker\.js',
    re.DOTALL,
)


def sync_embedded_tracker_data(repo_path: str, json_relpath: str) -> list[str]:
    """Refreshes the embedded tracker-data <script> block on each page in
    EMBED_PAGES from the current tracker-entries.json. Returns the list of
    relative paths that changed, so the caller can `git add` them."""
    repo = Path(repo_path)
    entries = json.loads((repo / json_relpath).read_text())
    payload = json.dumps(entries, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    replacement = (
        '<script type="application/json" id="tracker-data">' + payload + "</script>\n"
        '    <script defer src="assets/tracker.js'
    )

    changed = []
    for page in EMBED_PAGES:
        html_path = repo / page
        html = html_path.read_text()
        new_html, count = _BLOCK_RE.subn(replacement, html, count=1)
        if count == 0:
            raise RuntimeError(f'tracker.js script tag not found in {page}')
        if new_html != html:
            html_path.write_text(new_html)
            changed.append(page)
    return changed
