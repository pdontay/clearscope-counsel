import feedparser

from config import FEEDS
import db


def get_new_items():
    """Yields dicts for every feed entry not already marked seen. Marks each as
    seen immediately after yielding it, so a crash mid-run won't re-process
    items that already made it into a draft."""
    for feed in FEEDS:
        parsed = feedparser.parse(feed["url"])
        for entry in parsed.entries:
            guid = entry.get("id") or entry.get("link")
            if not guid or db.has_seen(guid):
                continue
            yield {
                "guid": guid,
                "feed_name": feed["name"],
                "track": feed["track"],
                "title": entry.get("title", "").strip(),
                "link": entry.get("link", ""),
                "summary": entry.get("summary", ""),
                "published": entry.get("published", ""),
            }
            db.mark_seen(guid, feed["name"])
