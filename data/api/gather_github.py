#!/usr/bin/env python3
"""
GATHER — pull REAL GitHub issues into the work_item table so the dashboard reflects
the actual repo instead of seeded demo data.

  python gather_github.py [owner/repo]        # default: SashaSkind/dailygate

Uses the local `gh` CLI (so it runs as you). Replaces the seeded *github* work items
with the live ones; leaves seeded email/slack examples in place. In production this
becomes a periodic sync or a webhook handler; for now it's a manual/cron-able pull.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

from database import get_conn, init_db

REPO = sys.argv[1] if len(sys.argv) > 1 else "SashaSkind/dailygate"


def _age_days(iso: str) -> int:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        return 0


def _fetch():
    r = subprocess.run(
        ["gh", "issue", "list", "-R", REPO, "--state", "all", "--limit", "50",
         "--json", "number,title,createdAt,state,labels,assignees"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(f"gh error: {r.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    return json.loads(r.stdout or "[]")


def _to_row(iss: dict):
    num = iss["number"]
    age = _age_days(iss["createdAt"])
    state = (iss.get("state") or "open").lower()
    status = "done" if state == "closed" else ("stale" if age > 14 else "open")
    owner = iss["assignees"][0]["login"] if iss.get("assignees") else None
    labels = [l.get("name", "").lower() for l in iss.get("labels", [])]
    wtype = "review" if any("review" in l for l in labels) else "task"
    #  id,            source,   title,         owner,  age,  status,  dup,  type
    return (f"gh-{num}", "github", iss["title"], owner, age, status, None, wtype)


def sync():
    init_db()
    issues = _fetch()
    with get_conn() as conn:
        conn.execute("DELETE FROM work_item WHERE source = 'github'")  # replace seeded github
        for iss in issues:
            conn.execute("INSERT OR REPLACE INTO work_item VALUES (?,?,?,?,?,?,?,?)", _to_row(iss))
    print(f"GATHER: synced {len(issues)} real issues from {REPO} into work_item")


if __name__ == "__main__":
    sync()
