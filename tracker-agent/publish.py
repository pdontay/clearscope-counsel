import json
import subprocess
from pathlib import Path

from config import GIT_REPO_PATH, TRACKER_JSON_RELPATH


def _run_git(*args):
    result = subprocess.run(
        ["git", *args], cwd=GIT_REPO_PATH, capture_output=True, text=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed:\n{result.stderr}")
    return result.stdout


def publish_entry(entry: dict) -> str:
    """Appends the approved entry to the live site's tracker JSON, commits, and
    pushes. Returns the commit SHA. Raises on any git failure — the caller
    should notify the human rather than silently swallowing a failed publish."""
    _run_git("pull", "--ff-only")

    json_path = Path(GIT_REPO_PATH) / TRACKER_JSON_RELPATH
    entries = json.loads(json_path.read_text())

    entries = [e for e in entries if e.get("id") != entry.get("id")]
    entries.append(entry)

    json_path.write_text(json.dumps(entries, indent=2) + "\n")

    _run_git("add", TRACKER_JSON_RELPATH)
    _run_git("commit", "-m", f"tracker: add {entry.get('id')}")
    _run_git("push", "origin", "main")

    return _run_git("rev-parse", "HEAD").strip()
