"""Cron job #1. Checks configured feeds for new items, runs each through the
Research Agent then the Voice Agent, and emails the draft for approval.
Nothing publishes here — see run_check_replies.py for that half."""
import json
import sys
import traceback

from config import MAX_DRAFTS_PER_RUN
import db
import feeds
import mailer
import research
import voice


def main():
    db.init_db()
    processed = 0

    for item in feeds.get_new_items():
        try:
            facts = research.extract_facts(item)

            if not facts.get("is_rule_change", True):
                print(f"Skipping (not a rule change): {item.get('title')}")
                continue

            if processed >= MAX_DRAFTS_PER_RUN and facts.get("importance") != "high":
                print(
                    f"Hit MAX_DRAFTS_PER_RUN ({MAX_DRAFTS_PER_RUN}) and this item isn't "
                    "flagged high-importance — stopping here. Remaining new items are "
                    "untouched (not marked seen) and will be picked up on the next run."
                )
                break

            if processed >= MAX_DRAFTS_PER_RUN:
                print(f"Cap reached, but drafting anyway — flagged high-importance for the BD landscape: {item.get('title')}")

            entry = voice.draft_entry(facts)

            draft_id = db.create_draft(
                track=item["track"],
                source_name=facts.get("source_name", item["feed_name"]),
                source_url=item["link"],
                entry_json=json.dumps(entry),
                thread_subject=None,
            )
            subject = mailer.send_draft(entry, facts, draft_id)
            db.update_draft(draft_id, thread_subject=subject)
            processed += 1
            print(f"Drafted #{draft_id}: {entry.get('headline')}")
        except Exception:
            print(f"FAILED on item {item.get('title')!r}:", file=sys.stderr)
            traceback.print_exc()
            # Deliberately continue — one bad feed item shouldn't block the rest.
            continue

    print(f"Done. {processed} new draft(s) sent for review.")


if __name__ == "__main__":
    main()
