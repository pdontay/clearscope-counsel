import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
# Primary model tries first; on any failure (rate limit, outage, deprecation),
# llm.chat() automatically falls back to the secondary model.
PRIMARY_MODEL = os.environ.get("PRIMARY_MODEL", "google/gemini-3.6-flash")
SECONDARY_MODEL = os.environ.get("SECONDARY_MODEL", "openai/gpt-4o-mini")

EMAIL_ADDRESS = os.environ["EMAIL_ADDRESS"]
EMAIL_PASSWORD = os.environ["EMAIL_PASSWORD"]
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", EMAIL_ADDRESS)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
IMAP_HOST = os.environ.get("IMAP_HOST", "imap.hostinger.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))

GIT_REPO_PATH = os.environ["GIT_REPO_PATH"]
TRACKER_JSON_RELPATH = "assets/tracker-entries.json"

STATE_DB_PATH = os.environ.get("STATE_DB_PATH", str(Path(__file__).parent / "state.db"))

# Lives in the site repo (a content/brand asset, not agent infra), so derive
# it from GIT_REPO_PATH rather than tracker-agent/'s own location on disk —
# the two aren't necessarily nested the same way on every machine.
VOICE_PROMPT_PATH = Path(GIT_REPO_PATH) / "VOICE-AGENT-PROMPT.md"

SUBJECT_PREFIX = "[ClearScope Tracker]"

# Hard cap on drafts emailed per run_check_feeds.py run. Once hit, the run
# stops immediately — remaining new items are left unmarked (not "seen") so
# they're picked up on the next run instead of being silently dropped.
MAX_DRAFTS_PER_RUN = int(os.environ.get("MAX_DRAFTS_PER_RUN", "5"))

# Each feed maps to a tracker "track". `crossover` items are shown on both
# the FINRA and Missouri-founder embeds (see assets/tracker.js).
#
# Verified live 2026-07-27 — re-check periodically, feed providers move these:
#   http://feeds.finra.org/FINRANotices    (200, real entries)
#   http://feeds.finra.org/FINRANews       (200, real entries)
#   https://www.sec.gov/news/pressreleases.rss (200, real entries)
#
# SIFMA does not publish a working public RSS feed as of this writing (every
# guessed URL 404s). Its comment letters are the tracker's stated differentiator
# anyway — pull them manually from sifma.org/advocacy/letters and feed the text
# into research.py's extract_facts() by hand when drafting an entry that cites one.
FEEDS = [
    {
        "name": "FINRA Regulatory Notices",
        "url": "http://feeds.finra.org/FINRANotices",
        "track": "finra",
    },
    {
        "name": "FINRA News Releases",
        "url": "http://feeds.finra.org/FINRANews",
        "track": "finra",
    },
    {
        "name": "SEC Press Releases",
        "url": "https://www.sec.gov/news/pressreleases.rss",
        "track": "finra",
    },
]
