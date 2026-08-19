import json
import re
from datetime import date

from config import VOICE_PROMPT_PATH
import llm

OUTPUT_SCHEMA_NOTE = """
Return ONLY valid JSON, no prose, matching exactly this shape (this is the schema
assets/tracker-entries.json and assets/tracker.js expect on the live site):
{
  "id": "kebab-case-slug-unique-and-short",
  "track": "finra" | "missouri" | "crossover",
  "status": "effective" | "comment-open" | "in-effect" | "proposed",
  "status_label": "short human label matching the status, e.g. Comment Period Open",
  "date_posted": "YYYY-MM-DD",
  "headline": "one plain-language sentence, no jargon",
  "the_change": "2-3 sentences: what happened, who issued it, when it takes effect",
  "why_it_matters": "2-3 sentences: operational impact, conclusion first",
  "action_items": ["2-4 short imperative action items"],
  "source_name": "string",
  "source_url": "string",
  "cta_text": "short question inviting the reader to get help",
  "cta_link": "contact.html?ref=tracker-<id>"
}

If operational_impact_facts in the research says "Not stated in source; needs attorney
judgment," write why_it_matters conservatively and end action_items with an item like
"Confirm with counsel how this specific change applies to your situation" rather than
inventing a specific impact the source didn't state.
"""


def draft_entry(facts: dict, revision_notes: str = None) -> dict:
    """Voice Agent: turn Research Agent facts into a tracker entry in the firm's voice."""
    voice_prompt = VOICE_PROMPT_PATH.read_text()

    user_prompt = f"Research facts (JSON):\n{json.dumps(facts, indent=2)}\n\n{OUTPUT_SCHEMA_NOTE}"
    if revision_notes:
        user_prompt += f"\n\nThe attorney reviewed a prior draft and left this feedback — apply it:\n{revision_notes}"

    raw = llm.chat(voice_prompt, user_prompt, temperature=0.4)
    try:
        entry = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        entry = json.loads(match.group(0))

    # Overwrite, don't setdefault: the model reliably invents a date_posted
    # rather than omitting it, and a wrong one is worse than a missing one
    # because tracker.js sorts the grid by this field — a bad date silently
    # buries a current entry mid-page. Seven live entries were stamped
    # 2026-03-30 this way before this was caught. The feed's own pubDate is
    # authoritative; today's date is the fallback when it won't parse.
    entry["date_posted"] = facts.get("source_published") or date.today().isoformat()
    entry.setdefault("source_name", facts.get("source_name"))
    entry.setdefault("source_url", facts.get("source_url"))
    entry.setdefault("track", facts.get("track"))
    if not entry.get("cta_link"):
        entry["cta_link"] = f"contact.html?ref=tracker-{entry.get('id', 'draft')}"
    return entry


def revise_entry(previous_entry: dict, revision_notes: str) -> dict:
    """Voice Agent, round 2+: take the attorney's plain-English feedback on a
    prior draft and produce a corrected entry in the same schema."""
    voice_prompt = VOICE_PROMPT_PATH.read_text()
    user_prompt = (
        f"Previous draft (JSON):\n{json.dumps(previous_entry, indent=2)}\n\n"
        f"The attorney's feedback on this draft — apply it and return the revised entry:\n"
        f"{revision_notes}\n\n{OUTPUT_SCHEMA_NOTE}"
    )
    raw = llm.chat(voice_prompt, user_prompt, temperature=0.4)
    try:
        entry = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        entry = json.loads(match.group(0))

    # Same reason as in draft_entry(): the date carries over from the draft
    # being revised, it is not up for renegotiation by the model.
    if previous_entry.get("date_posted"):
        entry["date_posted"] = previous_entry["date_posted"]

    for field in ("date_posted", "source_name", "source_url", "track", "id"):
        entry.setdefault(field, previous_entry.get(field))
    return entry
