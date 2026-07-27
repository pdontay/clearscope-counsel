"""Cron job #2. Polls the inbox for replies to draft emails (YES / NO / edits),
and acts: publish live, discard, or redraft-and-resend. This is the only place
in the pipeline that touches the live site's git repo."""
import json
import sys
import traceback

import db
import mailer
import publish
import voice


def main():
    db.init_db()
    replies = mailer.check_replies()

    if not replies:
        print("No new replies.")
        return

    for reply in replies:
        draft_id = reply["draft_id"]
        draft = db.get_draft(draft_id)

        if draft is None:
            print(f"Reply referenced unknown draft #{draft_id}, skipping.", file=sys.stderr)
            continue
        if draft["status"] != "pending":
            print(f"Draft #{draft_id} already {draft['status']}, ignoring stale reply.")
            continue

        entry = json.loads(draft["entry_json"])

        try:
            if reply["intent"] == "approve":
                sha = publish.publish_entry(entry)
                db.update_draft(draft_id, status="published")
                mailer.send_note(
                    f"#{draft_id} published",
                    f"Live now: {entry.get('headline')}\nCommit: {sha}\n"
                    f"https://clearscopecounsel.com/regulatory-watch.html",
                )
                print(f"Draft #{draft_id} published ({sha[:8]}).")

            elif reply["intent"] == "reject":
                db.update_draft(draft_id, status="rejected")
                mailer.send_note(f"#{draft_id} discarded", f"Discarded per your reply: {entry.get('headline')}")
                print(f"Draft #{draft_id} rejected.")

            else:  # revise
                revised = voice.revise_entry(entry, reply["text"])
                db.update_draft(draft_id, entry_json=json.dumps(revised))
                mailer.send_draft(revised, facts={}, draft_id=draft_id)
                print(f"Draft #{draft_id} revised and resent for review.")

        except Exception:
            print(f"FAILED handling reply for draft #{draft_id}:", file=sys.stderr)
            traceback.print_exc()
            mailer.send_note(
                f"#{draft_id} ACTION FAILED",
                f"Something broke while processing your reply for draft #{draft_id} "
                f"({entry.get('headline')}). It's still pending — check the VPS logs.",
            )


if __name__ == "__main__":
    main()
