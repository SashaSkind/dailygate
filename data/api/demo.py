"""
Demo execution builder — generates step-by-step agent execution narratives
for each demo work item. Powers the /demo/run endpoint.
"""
from typing import Any, Dict, List

# Minutes of manager time saved per autonomous decision by category
TIME_PER_CATEGORY: Dict[str, int] = {
    "issue-triage":       8,
    "capacity-assignment": 15,
    "nudge":              5,
    "thank-you-note":     10,
    "code-review":        20,
    "candidate-decision": 0,  # always escalated
}

TIER_LABEL = {0: "L0 OBSERVER", 1: "L1 REVERSIBLE", 2: "L2 ROUTINE"}

DEMO_ITEMS: Dict[str, Dict[str, Any]] = {
    "gh-412": {
        "id": "gh-412",
        "title": "Fix login race condition",
        "source": "github",
        "category": "issue-triage",
        "action": "Closed #412 as duplicate of #389 · Assigned #389 to alex (est_load=30, lightest capable)",
        "stakes": "low",
        "reversible": True,
        "time_saved_min": 8,
        "github": {
            "number": 412,
            "body": "Users reporting intermittent login failures under high load. Same symptoms as #389 — likely a duplicate.",
            "author": "priya",
            "created": "2 hours ago",
            "labels_before": [],
            "state_before": "open",
            "state_after": "closed",
            "labels_after": ["duplicate"],
            "assignee": "alex",
            "comment_posted": (
                "Closing as duplicate of #389 (Login intermittently fails under load). "
                "Reassigning #389 to @alex — they have available capacity (est_load=30%). "
                "— DailyGate · autonomous · issue-triage L2"
            ),
        },
    },
    "gh-389": {
        "id": "gh-389",
        "title": "Login intermittently fails under load",
        "source": "github",
        "category": "nudge",
        "action": "Posted stale-nudge comment on #389 · Added needs-attention label",
        "stakes": "low",
        "reversible": True,
        "time_saved_min": 5,
        "github": {
            "number": 389,
            "body": "Login is intermittently failing when >200 concurrent users. Seems load-related. No fix yet.",
            "author": "sasha",
            "created": "14 days ago",
            "labels_before": ["bug"],
            "state_before": "open",
            "state_after": "open",
            "labels_after": ["bug", "needs-attention"],
            "assignee": "sasha",
            "comment_posted": (
                "👋 Hey @sasha — this issue has been open for 14 days without activity. "
                "Any updates? Is this still being worked on? — DailyGate"
            ),
        },
    },
    "email-7": {
        "id": "email-7",
        "title": "Thank-you note to design partner",
        "source": "email",
        "category": "thank-you-note",
        "action": "Drafted and sent thank-you note to design partner · Marked email-7 done",
        "stakes": "low",
        "reversible": True,
        "time_saved_min": 10,
        "github": None,
        "email_preview": (
            "Subject: Thank you for your continued partnership!\n\n"
            "Hi there,\n\nI wanted to reach out to express our sincere thanks for your invaluable "
            "feedback during our design review. Your insights on the onboarding flow were spot-on.\n\n"
            "Looking forward to continuing to work together!\n\nBest,\nThe Team"
        ),
    },
    "email-3": {
        "id": "email-3",
        "title": "Candidate decision — Jordan (eng hire)",
        "source": "email",
        "category": "candidate-decision",
        "action": "ESCALATE — candidate-decision is a hard ceiling · Added to manager queue",
        "stakes": "high",
        "reversible": False,
        "time_saved_min": 0,
        "github": None,
    },
    "gh-377": {
        "id": "gh-377",
        "title": "Refactor auth middleware",
        "source": "github",
        "category": "code-review",
        "action": "Added needs-review label · Requested reviewer from team",
        "stakes": "low",
        "reversible": True,
        "time_saved_min": 20,
        "github": {
            "number": 377,
            "body": "Refactoring the auth middleware to use the new session token format. Breaking into smaller PRs.",
            "author": "sasha",
            "created": "7 days ago",
            "labels_before": [],
            "state_before": "open",
            "state_after": "open",
            "labels_after": ["needs-review"],
            "assignee": "alex",
            "comment_posted": (
                "Requesting review from @alex — they have the most context on the session token changes. "
                "— DailyGate"
            ),
        },
    },
}


def build_steps(item: Dict[str, Any], routing: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Build step-by-step execution narrative for a demo item."""
    level    = routing["autonomy_level"]
    ceiling  = routing["ceiling"]
    score    = routing["trust_score"]
    threshold = routing["auto_threshold"]
    conf     = routing.get("trust_confidence", 0)
    tier     = TIER_LABEL.get(level, "L0 OBSERVER")
    cat      = item["category"]
    src      = item["source"]

    steps: List[Dict[str, Any]] = [
        {
            "id": 1,
            "type": "received",
            "text": item["title"],
            "sub": f"{src.upper()} · {item['id']} · {item['stakes']} stakes",
            "delay_ms": 0,
        },
        {
            "id": 2,
            "type": "classify",
            "text": f"Classified as: {cat}",
            "sub": f"Reversible: {item['reversible']} · Risk: {routing.get('risk_profile', 'medium')}",
            "delay_ms": 700,
        },
    ]

    if ceiling:
        steps += [
            {
                "id": 3,
                "type": "ceiling",
                "text": "Hard ceiling — never autonomous",
                "sub": "Hiring, firing, legal decisions are always human — no score can override this",
                "delay_ms": 1400,
            },
            {
                "id": 4,
                "type": "escalate",
                "text": "Added to your queue",
                "sub": "Awaiting manager decision",
                "delay_ms": 2100,
            },
        ]
        return steps

    trust_pass = score >= threshold and conf >= 0.20
    steps.append({
        "id": 3,
        "type": "trust_check",
        "text": f"Trust: {score*100:.0f}% vs threshold {threshold*100:.0f}%",
        "sub": f"Confidence: {conf*100:.0f}% · {tier}",
        "delay_ms": 1400,
        "pass": trust_pass,
    })

    if level < 2:
        steps.append({
            "id": 4,
            "type": "escalate",
            "text": f"Score below threshold — escalating",
            "sub": f"Need {threshold*100:.0f}%, have {score*100:.0f}% — adding to your queue",
            "delay_ms": 2100,
        })
        return steps

    # Level 2: full autonomous execution
    gh = item.get("github")
    email_preview = item.get("email_preview")
    base_delay = 2100

    steps.append({
        "id": 4,
        "type": "route",
        "text": f"{tier} — full permissions granted",
        "sub": ("Agent has: github_issues_update, github_issues_create_comment"
                if gh else "Agent has: composio_gmail_send"),
        "delay_ms": base_delay,
    })

    if gh:
        steps += [
            {
                "id": 5,
                "type": "analyze",
                "text": f"Reading #{gh['number']} · Checking repo context",
                "sub": f"Author: @{gh['author']} · {gh['created']} · "
                       + (f"Possible duplicate detected" if "duplicate" in item["action"] else "Stale — 14 days open"),
                "delay_ms": base_delay + 900,
            },
            {
                "id": 6,
                "type": "act",
                "text": item["action"],
                "sub": f'Comment: "{gh["comment_posted"][:90]}…"',
                "delay_ms": base_delay + 1900,
            },
        ]
    else:
        steps += [
            {
                "id": 5,
                "type": "act",
                "text": item["action"],
                "sub": (email_preview[:80] + "…") if email_preview else "Task completed",
                "delay_ms": base_delay + 900,
            },
        ]

    n = len(steps)
    steps += [
        {
            "id": n + 1,
            "type": "record",
            "text": "Decision recorded · Trust score updating",
            "sub": "Bayesian engine recomputing · Langfuse trace created",
            "delay_ms": base_delay + 2800,
        },
        {
            "id": n + 2,
            "type": "saved",
            "text": f"~{item['time_saved_min']} minutes saved",
            "sub": f"{cat} trust climbing → closer to next promotion",
            "delay_ms": base_delay + 3600,
        },
    ]
    return steps
