# ClearScope Regulatory Tracker Agent

Runs on its own VPS (kept separate from the VPS serving the live site). Two
cron jobs:

1. **`run_check_feeds.py`** — polls FINRA/SEC RSS feeds, runs each new item
   through a Research Agent (extracts only facts stated in the source) then a
   Voice Agent (drafts the entry in Dontay's voice, per `../VOICE-AGENT-PROMPT.md`),
   and emails the draft for review. Nothing publishes here.
2. **`run_check_replies.py`** — polls the inbox for your reply. `YES` publishes
   the draft live (git commit + push to `pdontay/clearscope-counsel`). `NO`
   discards it. Anything else is treated as edit feedback — the Voice Agent
   redrafts and emails you the revised version for another round.

Nothing reaches the live site without you replying `YES` to an email first.

```
RSS feeds → Research Agent → Voice Agent → email you → [YES/NO/revise] → git push → GitHub Action → rsync to Hostinger
                                              ^________________________|
                                              (revise loops back here)
```

The `git push origin main` this script runs is what triggers
`.github/workflows/deploy.yml`, which rsyncs the changed files straight into
`domains/clearscopecounsel.com/public_html` on the live Hostinger server — no
manual File Manager upload needed anymore for anything that goes through this
pipeline (or any other push to `main`, for that matter).

## What's NOT automated, on purpose

- **Missouri filings** have no reliable public RSS feed. Missouri-track
  entries are written by hand and dropped straight into
  `../assets/tracker-entries.json` — there's no feed source configured for
  this track in `config.py`.
- **SIFMA comment letters** — SIFMA doesn't publish a working public RSS feed
  (every guessed URL 404s as of this writing). Since SIFMA's letters are the
  tracker's stated differentiator (FINRA/SEC publish the rule, SIFMA publishes
  the industry's reaction), pull those manually from
  `sifma.org/advocacy/letters` and paste the text into a research step by
  hand when relevant — don't let the agent guess what SIFMA said.

## One-time setup on the VPS

```bash
# 1. System prerequisites (mirrors the Hostinger VPS video workflow)
sudo apt update && sudo apt install -y python3 python3-venv python3-pip git

# 2. Clone the site repo somewhere the agent can push to
git clone https://github.com/pdontay/clearscope-counsel.git /home/deploy/clearscope-counsel
# Configure git auth for pushes — either a deploy key (SSH) or a PAT baked
# into the remote URL / a credential helper. This script only ever runs
# `git push`, it does not configure auth for you.

# 3. Copy this tracker-agent/ folder onto the VPS (scp, same as the video)
scp -r tracker-agent root@<VPS_IP>:/home/deploy/

# 4. Python environment
cd /home/deploy/tracker-agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 5. Secrets
cp .env.example .env
nano .env   # fill in OPENROUTER_API_KEY, GMAIL_ADDRESS, GMAIL_APP_PASSWORD,
            # GIT_REPO_PATH=/home/deploy/clearscope-counsel

# 6. Sanity check (sends no email, publishes nothing — just proves the feeds work)
python3 -c "import db, feeds; db.init_db(); print(len(list(feeds.get_new_items())), 'new items found')"
```

### Email account

Uses `marketing@clearscopecounsel.com` (Hostinger webmail) for both sending
drafts (SMTP) and polling for your replies (IMAP) — `imap.hostinger.com:993`
/ `smtp.hostinger.com:465`, both already set as the defaults in `config.py`.
Unlike Gmail, Hostinger webmail has no separate "app password" concept —
`EMAIL_PASSWORD` is the actual mailbox password, so it has full read/send/
delete access to that inbox. Rotate it (hPanel → Emails → Mailboxes) once
the pipeline's confirmed working if that's a concern, and update `.env`
on the VPS to match.

Drafts get sent to `NOTIFY_EMAIL` (your Gmail). When you reply, it lands
back in `marketing@clearscopecounsel.com`'s inbox — that's what gets polled.

### Git push access

The agent runs plain `git pull --ff-only` / `git push origin main` in
`GIT_REPO_PATH`. Set up whichever auth you're already comfortable with on
that VPS — an SSH deploy key added to the GitHub repo (read/write), or a
fine-grained Personal Access Token scoped to just this one repo, wired into
the remote URL or a git credential helper. Keep the token scoped to this repo
only — the agent never needs broader GitHub access.

## Cron

```cron
# Check feeds once a week (Monday 8am) — regulatory notices don't drop often
# enough to justify anything more frequent, and it keeps LLM spend minimal.
0 8 * * 1 /home/deploy/tracker-agent/.venv/bin/python3 /home/deploy/tracker-agent/run_check_feeds.py >> /home/deploy/tracker-agent/feeds.log 2>&1

# Check for your email replies every 10 minutes — this one stays frequent so
# an approval doesn't sit for hours before publishing.
*/10 * * * * /home/deploy/tracker-agent/.venv/bin/python3 /home/deploy/tracker-agent/run_check_replies.py >> /home/deploy/tracker-agent/replies.log 2>&1
```

`crontab -e`, paste the above (adjust paths if you didn't use `/home/deploy`),
`Ctrl+O` then `Enter` to save, `Ctrl+X` to exit. Verify with `crontab -l`.

## Replying to a draft email

- **`YES`** (or "approve", "go ahead", "publish") as the first line → publishes
  live immediately, pushes to GitHub, and emails you back a confirmation with
  the commit SHA.
- **`NO`** (or "reject", "discard") as the first line → discards it, no trace
  left on the live site.
- **Anything else** → treated as your edit notes. The Voice Agent redrafts
  with your feedback applied and emails you the new version under the same
  subject line for another round. Repeat as many times as you want — nothing
  publishes until you send an explicit `YES`.

Reply on the same email thread (so the subject line still contains
`[ClearScope Tracker] #<id>`) — that's how the agent matches your reply back
to the right draft.

## Low-confidence flags

The Research Agent marks a draft `confidence: low` when the source text was
thin or ambiguous, and the email you receive will have a `⚠ LOW CONFIDENCE`
banner at the top. Read the source directly before approving those — the
Voice Agent will write a conservative "needs attorney judgment" line rather
than invent an impact, but it's still worth a closer look.

## Adding a feed

Edit `FEEDS` in `config.py`. Verify the URL actually returns real RSS/XML
before adding it — feed providers move these without warning:

```bash
curl -sL -A "Mozilla/5.0" "<candidate-url>" | head -c 500
```
