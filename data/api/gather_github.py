#!/usr/bin/env python3
"""
GATHER — pull REAL GitHub issues into the work_item table so the dashboard reflects
an actual repo instead of seeded demo data.

  python gather_github.py [owner/repo]        # default: SashaSkind/dailygate

Uses the GitHub REST API directly (urllib) — no `gh` CLI, so the same code path runs
locally AND on the deployed server, and behind the POST /gather endpoint per tenant.
Public repos work with no token (rate-limited); pass a token for private repos or
higher limits. Replaces that tenant's *github* work items with the live ones; leaves
seeded email/slack examples in place.
"""
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

from database import get_conn, init_db

DEFAULT_REPO = "SashaSkind/dailygate"


def _age_days(iso: str) -> int:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return max(0, (datetime.now(timezone.utc) - dt).days)
    except Exception:
        return 0


def _fetch_rest(repo: str, token: str | None = None, limit: int = 50) -> list[dict]:
    """Fetch issues (open + closed) for owner/repo via the GitHub REST API."""
    url = f"https://api.github.com/repos/{repo}/issues?state=all&per_page={min(limit, 100)}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "dailygate-gather",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    # The issues endpoint also returns PRs — drop those; keep only real issues.
    return [i for i in data if "pull_request" not in i][:limit]


def _to_row(iss: dict, tenant: str):
    num = iss["number"]
    age = _age_days(iss.get("created_at", ""))
    state = (iss.get("state") or "open").lower()
    status = "done" if state == "closed" else ("stale" if age > 14 else "open")
    owner = (iss.get("assignee") or {}).get("login") if iss.get("assignee") else None
    labels = [(l.get("name") or "").lower() for l in iss.get("labels", [])]
    wtype = "review" if any("review" in l for l in labels) else "task"
    #  tenant, id,           source,   title,          owner, age, status, dup,  type
    return (tenant, f"gh-{num}", "github", iss["title"], owner, age, status, None, wtype)


def gather(repo: str, tenant: str = "demo", token: str | None = None) -> dict:
    """Sync a tenant's github work items from a live repo. Returns a summary dict."""
    init_db()
    issues = _fetch_rest(repo, token)
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM work_item WHERE source='github' AND tenant=?", (tenant,)
        )
        for iss in issues:
            conn.execute(
                "INSERT OR REPLACE INTO work_item "
                "(tenant, id, source, title, owner_suggested, age_days, status, is_duplicate_of, type) "
                "VALUES (?,?,?,?,?,?,?,?,?)", _to_row(iss, tenant))
    return {"repo": repo, "tenant": tenant, "synced": len(issues)}


if __name__ == "__main__":
    repo = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_REPO
    try:
        out = gather(repo, "demo", os.environ.get("GITHUB_TOKEN"))
    except urllib.error.HTTPError as e:
        print(f"GitHub API error {e.code}: {e.reason} for {repo}", file=sys.stderr)
        sys.exit(1)
    print(f"GATHER: synced {out['synced']} real issues from {repo} into work_item")
