import sqlite3
from contextlib import contextmanager

from config import STATE_DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS seen_feed_items (
    guid TEXT PRIMARY KEY,
    feed_name TEXT NOT NULL,
    seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    entry_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    thread_subject TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


@contextmanager
def connect():
    conn = sqlite3.connect(STATE_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)


def has_seen(guid: str) -> bool:
    with connect() as conn:
        row = conn.execute("SELECT 1 FROM seen_feed_items WHERE guid = ?", (guid,)).fetchone()
        return row is not None


def mark_seen(guid: str, feed_name: str):
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO seen_feed_items (guid, feed_name) VALUES (?, ?)",
            (guid, feed_name),
        )


def create_draft(track: str, source_name: str, source_url: str, entry_json: str, thread_subject: str) -> int:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO drafts (track, source_name, source_url, entry_json, thread_subject) "
            "VALUES (?, ?, ?, ?, ?)",
            (track, source_name, source_url, entry_json, thread_subject),
        )
        return cur.lastrowid


def get_draft(draft_id: int):
    with connect() as conn:
        return conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()


def get_pending_drafts():
    with connect() as conn:
        return conn.execute("SELECT * FROM drafts WHERE status = 'pending'").fetchall()


def update_draft(draft_id: int, **fields):
    set_clause = ", ".join(f"{k} = ?" for k in fields) + ", updated_at = datetime('now')"
    values = list(fields.values())
    with connect() as conn:
        conn.execute(f"UPDATE drafts SET {set_clause} WHERE id = ?", (*values, draft_id))
