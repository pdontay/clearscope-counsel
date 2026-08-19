import json
import re
from datetime import datetime
from email.utils import parsedate_to_datetime

import requests
from bs4 import BeautifulSoup

import llm

RESEARCH_SYSTEM_PROMPT = """You are a research assistant for a law firm's regulatory tracker.
The tracker exists to tell broker-dealers and compliance teams about actual RULE CHANGES —
new rules, rule amendments, rule proposals, comment periods on rules, or interpretive guidance
that changes how an existing rule applies. It is NOT a general news feed.

First decide is_rule_change. Answer false for: board/governor elections or election notices,
personnel announcements and appointments, investor-education research reports, conference or
event announcements, and enforcement actions against a single named firm (those are case news,
not a rule everyone needs to act on). Answer true for: new or amended rules, rule proposals,
comment-period notices, and FINRA/SEC interpretive guidance on existing rules.

If is_rule_change is false, you may leave the other fact fields minimal — they will not be used.

If is_rule_change is true, also extract only what is explicitly stated in the source. Do not
infer deadlines, dollar amounts, or effective dates that are not written in the text. If
something is unclear or missing, say so explicitly in that field rather than guessing. Also
set importance to "high" only if this changes something broadly across the broker-dealer
landscape (e.g., a margin, reporting, or supervision rule overhaul affecting most firms) —
"normal" for a narrower or more routine rule change.

Return ONLY valid JSON, no prose, in exactly this shape:
{
  "is_rule_change": true | false,
  "importance": "high" | "normal",
  "status": one of "effective" | "comment-open" | "in-effect" | "proposed",
  "status_label": short human label, e.g. "Effective June 4, 2026" or "Comment Period Open",
  "effective_or_key_date": ISO date if stated, else null,
  "what_changed_facts": 2-4 sentences of only the facts stated in the source,
  "operational_impact_facts": 1-3 sentences on who is affected and how, ONLY if the source
    states this directly — otherwise write "Not stated in source; needs attorney judgment.",
  "notable_quotes": array of up to 2 short direct quotes worth citing, or [],
  "confidence": "high" | "medium" | "low" — low if the source text was thin or ambiguous
}"""


def normalize_feed_date(raw: str):
    """Feed pubDates to an ISO date, or None if unparseable. The three feeds
    don't agree on a format: SEC and FINRA News send RFC-822
    ("Mon, 03 Aug 26 12:00:00 +0000", two-digit year and all), FINRA Notices
    sends "Aug 03, 2026"."""
    raw = (raw or "").strip()
    if not raw:
        return None

    try:
        parsed = parsedate_to_datetime(raw)
        if parsed is not None:
            return parsed.date().isoformat()
    except (TypeError, ValueError):
        pass

    for fmt in ("%b %d, %Y", "%B %d, %Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def fetch_page_text(url: str, max_chars: int = 6000) -> str:
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        for tag in soup(["script", "style", "nav", "header", "footer"]):
            tag.decompose()
        text = re.sub(r"\n{3,}", "\n\n", soup.get_text("\n").strip())
        return text[:max_chars]
    except requests.RequestException:
        return ""


def extract_facts(feed_item: dict) -> dict:
    """Research Agent: turn a raw feed item into structured, source-grounded facts."""
    page_text = fetch_page_text(feed_item["link"])
    source_text = page_text or feed_item.get("summary", "")

    user_prompt = (
        f"Title: {feed_item['title']}\n"
        f"Source: {feed_item['feed_name']}\n"
        f"URL: {feed_item['link']}\n"
        f"Published: {feed_item.get('published', 'unknown')}\n\n"
        f"Source text:\n{source_text}"
    )

    raw = llm.chat(RESEARCH_SYSTEM_PROMPT, user_prompt, temperature=0.1)
    try:
        facts = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        facts = json.loads(match.group(0)) if match else {}

    facts["source_name"] = feed_item["feed_name"] + ": " + feed_item["title"]
    facts["source_url"] = feed_item["link"]
    facts["track"] = feed_item["track"]
    # The entry's date_posted is derived from this, never from the model —
    # see the note in voice.draft_entry().
    facts["source_published"] = normalize_feed_date(feed_item.get("published"))
    return facts
