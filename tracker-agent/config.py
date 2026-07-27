import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")

GMAIL_ADDRESS = os.environ["GMAIL_ADDRESS"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", GMAIL_ADDRESS)

GIT_REPO_PATH = os.environ["GIT_REPO_PATH"]
TRACKER_JSON_RELPATH = "assets/tracker-entries.json"

STATE_DB_PATH = os.environ.get("STATE_DB_PATH", str(Path(__file__).parent / "state.db"))

VOICE_PROMPT_PATH = Path(__file__).parent.parent / "VOICE-AGENT-PROMPT.md"

SUBJECT_PREFIX = "[ClearScope Tracker]"

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
