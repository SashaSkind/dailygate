"""
Seed the database with demo data per data/PLAN.md §5.
Run once: python seed.py
"""
import sqlite3
from datetime import datetime, timedelta, timezone
from database import get_conn, init_db
from trust import recompute_all


def already_seeded(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT COUNT(*) FROM work_item").fetchone()
    return row[0] > 0


def ts(days_ago: int = 0) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def seed():
    init_db()
    with get_conn() as conn:
        if already_seeded(conn):
            print("Already seeded — skipping.")
            return

        # ── WORKLOAD (5 assignees) ─────────────────────────────────────────────
        workload = [
            ("sasha",      "person", 6, 82),  # overloaded (>70)
            ("alex",       "person", 2, 30),  # light — capacity target
            ("priya",      "person", 4, 55),  # medium
            ("marco",      "person", 3, 45),  # light-medium
            ("triage-bot", "agent",  1, 15),  # agent
        ]
        conn.executemany(
            "INSERT OR REPLACE INTO workload VALUES (?,?,?,?)", workload
        )

        # ── WORK ITEMS (~30) ───────────────────────────────────────────────────
        # Fields: id, source, title, owner_suggested, age_days, status, is_duplicate_of, type
        items = [
            # --- SASHA overloaded (6 open tasks) ---
            ("gh-389", "github", "Login intermittently fails under load",      "sasha",  14, "open",        None,      "task"),
            ("gh-401", "github", "Add rate limiting to public API",            "sasha",   3, "in_progress", None,      "task"),
            ("gh-377", "github", "Refactor auth middleware",                   "sasha",   7, "open",        None,      "review"),
            ("gh-395", "github", "Fix session expiry edge case",               "sasha",   5, "open",        None,      "task"),
            ("gh-398", "github", "Migrate legacy token service",               "sasha",   2, "open",        None,      "task"),
            ("gh-403", "github", "Patch CORS header for mobile clients",       "sasha",   1, "open",        None,      "task"),

            # --- DEMO BEAT #1: DUPLICATE ---
            ("gh-412", "github", "Fix login race condition",                   "sasha",   0, "open",        "gh-389",  "task"),

            # --- DEMO BEAT #2: OVERLOAD TRAP → reassign to alex ---
            ("gh-422", "github", "Add caching layer to user profile endpoint", "sasha",   1, "open",        None,      "task"),

            # --- ALEX light (2 open tasks) ---
            ("gh-410", "github", "Add tests for the parser",                   "alex",    3, "open",        None,      "review"),
            ("gh-418", "github", "Upgrade to Node 24",                         "alex",    1, "open",        None,      "task"),

            # --- PRIYA medium (4 open tasks) ---
            ("gh-415", "github", "Flaky test in CI pipeline",                  "priya",   5, "open",        None,      "review"),
            ("gh-405", "github", "Investigate memory leak in worker",          "priya",   6, "in_progress", None,      "task"),
            ("gh-425", "github", "Document retry logic in job queue",          "priya",   3, "open",        None,      "task"),
            ("gh-427", "github", "Fix pagination on /reports endpoint",        "priya",   4, "open",        None,      "task"),

            # --- MARCO light-medium (3 open tasks) ---
            ("gh-430", "github", "Update README install steps",                "marco",   2, "open",        None,      "task"),
            ("gh-433", "github", "Add linting to CI",                          "marco",   4, "open",        None,      "task"),
            ("gh-436", "github", "Bump dependency versions",                   "marco",   1, "open",        None,      "task"),

            # --- TRIAGE-BOT (1 open task) ---
            ("gh-440", "github", "Auto-label stale issues",                    "triage-bot", 0, "open",     None,      "task"),

            # --- UNASSIGNED ---
            ("gh-420", "github", "Upgrade to Node 24 (secondary tracker)",    None,      1, "open",        None,      "task"),

            # --- SLACK duplicates ---
            ("slack-88",  "slack", "Can someone own the dashboard bug?",       None,       2, "open",       "gh-405",  "task"),
            ("slack-91",  "slack", "Who can review the auth PR?",              None,       3, "open",       "gh-377",  "task"),

            # --- DEMO BEAT #3: FORGOTTEN stale tasks ---
            ("email-7",  "email", "Thank-you note to design partner",          "sasha",   9, "stale",       None,      "email"),
            ("email-9",  "email", "Follow up with vendor on contract",         "marco",  12, "stale",       None,      "email"),
            ("email-11", "email", "Send onboarding checklist to new hire",     "priya",   8, "stale",       None,      "email"),

            # --- DEMO BEAT #4: HIGH-STAKES CEILING → always escalates ---
            ("email-3",  "email", "Candidate decision — Jordan (eng hire)",   None,       4, "open",        None,      "email"),
            ("email-5",  "email", "Candidate decision — Riley (design hire)", None,       2, "open",        None,      "email"),

            # --- DONE items (realistic spread) ---
            ("gh-350", "github", "Fix broken link in docs",                   "alex",    20, "done",        None,      "task"),
            ("gh-355", "github", "Add dark mode toggle",                      "priya",   18, "done",        None,      "task"),
            ("gh-360", "github", "Cache API responses in Redis",              "marco",   15, "done",        None,      "task"),
            ("gh-365", "github", "Write migration script for v2 schema",      "sasha",   12, "done",        None,      "task"),
        ]
        conn.executemany(
            "INSERT OR REPLACE INTO work_item VALUES (?,?,?,?,?,?,?,?)", items
        )

        # ── TRUST ROWS (pre-seeded per §5.3) ─────────────────────────────────
        # Fields: category, trust_level, trust_score, trust_confidence, auto_threshold,
        #         decay_half_life, approvals_count, overrides_count, ceiling, risk_profile, last_event
        # Scores are placeholder — recompute_all() recalculates from real decision history.
        trust_rows = [
            # category              level   score  conf  thresh  hl  apr  ovr  ceil  risk        last_event
            ("issue-triage",        "auto",  0.85, 0.70, 0.70,  30,  5,   0,   0,  "low",      "Bootstrapped"),
            ("capacity-assignment", "auto",  0.82, 0.65, 0.70,  30,  4,   0,   0,  "low",      "Bootstrapped"),
            ("thank-you-note",      "auto",  0.80, 0.55, 0.70,  30,  3,   0,   0,  "low",      "Bootstrapped"),
            ("nudge",               "auto",  0.76, 0.50, 0.70,  30,  3,   1,   0,  "low",      "Bootstrapped"),
            ("code-review",         "ask",   0.62, 0.40, 0.80,  30,  2,   0,   0,  "medium",   "Bootstrapped"),
            ("candidate-decision",  "ask",   0.33, 0.00, 0.92,  30,  0,   0,   1,  "high",     "Ceiling — always escalates"),
        ]
        conn.executemany(
            """INSERT OR REPLACE INTO trust
               (category, trust_level, trust_score, trust_confidence, auto_threshold,
                decay_half_life, approvals_count, overrides_count, ceiling, risk_profile, last_event)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            trust_rows,
        )

        # ── DECISION HISTORY (15-20 rows consistent with trust counts) ────────
        # Fields: id, item_id, category, action, stakes, reversible, was_autonomous, manager_response, timestamp
        decisions = [
            # issue-triage: 5 approvals (approved/autonomous), 0 overrides → auto
            ("d-001", "gh-312", "issue-triage",        "Closed gh-312 as duplicate of gh-289",          "low",  1, 1, "n/a",      ts(20)),
            ("d-002", "gh-320", "issue-triage",        "Closed gh-320 as duplicate of gh-305",          "low",  1, 0, "approved", ts(18)),
            ("d-003", "gh-331", "issue-triage",        "Closed gh-331 as duplicate of gh-289",          "low",  1, 1, "n/a",      ts(15)),
            ("d-004", "gh-345", "issue-triage",        "Closed gh-345 as duplicate of gh-305",          "low",  1, 1, "n/a",      ts(10)),
            ("d-005", "gh-358", "issue-triage",        "Closed gh-358 as duplicate of gh-312",          "low",  1, 1, "n/a",      ts(5)),

            # capacity-assignment: 4 approvals → auto
            ("d-006", "gh-340", "capacity-assignment", "Reassigned gh-340 from sasha to alex",          "low",  1, 0, "approved", ts(22)),
            ("d-007", "gh-348", "capacity-assignment", "Reassigned gh-348 from sasha to marco",         "low",  1, 1, "n/a",      ts(16)),
            ("d-008", "gh-356", "capacity-assignment", "Reassigned gh-356 from priya to alex",          "low",  1, 1, "n/a",      ts(9)),
            ("d-009", "gh-362", "capacity-assignment", "Reassigned gh-362 from sasha to triage-bot",    "low",  1, 1, "n/a",      ts(4)),

            # thank-you-note: 3 approvals → auto
            ("d-010", "email-1", "thank-you-note",     "Sent thank-you to design partner",              "low",  1, 0, "approved", ts(25)),
            ("d-011", "email-2", "thank-you-note",     "Sent thank-you to beta tester",                 "low",  1, 1, "n/a",      ts(14)),
            ("d-012", "email-4", "thank-you-note",     "Sent thank-you to open-source contributor",     "low",  1, 1, "n/a",      ts(7)),

            # nudge: 1 override (early), then 3 approvals → auto
            ("d-013", "gh-280", "nudge",               "Nudged sasha on stale task gh-280",             "low",  1, 0, "overridden", ts(30)),  # early override
            ("d-014", "gh-290", "nudge",               "Nudged alex on stale task gh-290",              "low",  1, 1, "n/a",      ts(21)),
            ("d-015", "gh-300", "nudge",               "Nudged priya on stale review gh-300",           "low",  1, 1, "n/a",      ts(13)),
            ("d-016", "gh-310", "nudge",               "Nudged marco on stale task gh-310",             "low",  1, 1, "n/a",      ts(6)),

            # code-review: 2 approvals, 0 overrides → still ask (one more → auto)
            ("d-017", "gh-370", "code-review",         "Requested code review for gh-370",              "low",  1, 0, "approved", ts(12)),
            ("d-018", "gh-380", "code-review",         "Requested code review for gh-380",              "low",  1, 0, "approved", ts(8)),

            # candidate-decision: ceiling — always escalated
            ("d-019", "email-3", "candidate-decision", "Escalated candidate decision for Jordan",       "high", 0, 0, "pending",  ts(4)),
        ]
        conn.executemany(
            "INSERT OR REPLACE INTO decision VALUES (?,?,?,?,?,?,?,?,?)", decisions
        )

        print(f"Seeded: {len(items)} work items, {len(workload)} assignees, "
              f"{len(trust_rows)} trust rows, {len(decisions)} decisions.")

    # Recompute Bayesian scores from the real decision history (outside the
    # seeding transaction so reads are consistent)
    with get_conn() as conn:
        recompute_all(conn)
        print("Trust scores recomputed from decision history.")


if __name__ == "__main__":
    seed()
