import email
import imaplib
import re
import smtplib
from email.header import decode_header
from email.mime.text import MIMEText

from config import GMAIL_ADDRESS, GMAIL_APP_PASSWORD, NOTIFY_EMAIL, SUBJECT_PREFIX

DRAFT_ID_RE = re.compile(re.escape(SUBJECT_PREFIX) + r"\s*#(\d+)")
APPROVE_RE = re.compile(r"^\s*(yes|approve|approved|ok|go ahead|publish)\b", re.IGNORECASE)
REJECT_RE = re.compile(r"^\s*(no|reject|discard|skip|kill)\b", re.IGNORECASE)


def _render_draft_body(entry: dict, facts: dict, draft_id: int) -> str:
    confidence = facts.get("confidence", "unknown")
    confidence_note = ""
    if confidence == "low":
        confidence_note = (
            "\n⚠ LOW CONFIDENCE: the source text was thin or ambiguous. Read the "
            "source directly before approving this one.\n"
        )

    action_items = "\n".join(f"  {i+1}. {a}" for i, a in enumerate(entry.get("action_items", [])))

    return f"""Draft #{draft_id} — {entry.get('track', '?').upper()} track
{confidence_note}
STATUS: {entry.get('status_label')}
HEADLINE: {entry.get('headline')}

THE CHANGE:
{entry.get('the_change')}

WHY IT MATTERS:
{entry.get('why_it_matters')}

WHAT TO DO NOW:
{action_items}

SOURCE: {entry.get('source_name')}
{entry.get('source_url')}

---
Reply YES to publish this live, as-is.
Reply NO to discard it.
Or just reply with your edits/feedback in plain English and I'll redraft and send it back.
"""


def send_draft(entry: dict, facts: dict, draft_id: int) -> str:
    """Emails the draft for review. Returns the subject line used (for threading)."""
    subject = f"{SUBJECT_PREFIX} #{draft_id} — {entry.get('headline', 'New entry')}"
    body = _render_draft_body(entry, facts, draft_id)

    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = NOTIFY_EMAIL

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        smtp.send_message(msg)

    return subject


def send_note(subject_suffix: str, body: str):
    """Generic notification, e.g. 'published live' or 'discarded' confirmations."""
    msg = MIMEText(body, "plain")
    msg["Subject"] = f"{SUBJECT_PREFIX} {subject_suffix}"
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = NOTIFY_EMAIL
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        smtp.send_message(msg)


def _decode(value) -> str:
    if not value:
        return ""
    parts = decode_header(value)
    return "".join(
        (p.decode(enc or "utf-8", errors="ignore") if isinstance(p, bytes) else p) for p, enc in parts
    )


def _get_plain_text(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and not part.get("Content-Disposition"):
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="ignore")
        return ""
    charset = msg.get_content_charset() or "utf-8"
    return msg.get_payload(decode=True).decode(charset, errors="ignore")


def _first_meaningful_line(body: str) -> str:
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(">"):
            continue
        return stripped
    return ""


def check_replies():
    """Polls the inbox for unread replies to draft emails. Returns a list of
    dicts: {draft_id, intent: 'approve'|'reject'|'revise', text}. Marks each
    processed message as read."""
    results = []
    with imaplib.IMAP4_SSL("imap.gmail.com") as imap:
        imap.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        imap.select("INBOX")
        status, data = imap.search(None, "UNSEEN")
        if status != "OK":
            return results

        for num in data[0].split():
            status, msg_data = imap.fetch(num, "(RFC822)")
            if status != "OK":
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            subject = _decode(msg.get("Subject"))
            match = DRAFT_ID_RE.search(subject)
            if not match:
                continue  # not a reply to one of our drafts; leave unread for a human

            draft_id = int(match.group(1))
            body = _get_plain_text(msg)
            first_line = _first_meaningful_line(body)

            if APPROVE_RE.match(first_line):
                results.append({"draft_id": draft_id, "intent": "approve", "text": body})
            elif REJECT_RE.match(first_line):
                results.append({"draft_id": draft_id, "intent": "reject", "text": body})
            else:
                results.append({"draft_id": draft_id, "intent": "revise", "text": body})

            imap.store(num, "+FLAGS", "\\Seen")

    return results
