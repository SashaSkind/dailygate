"""
DailyGate — Data + Trust API (Person B).

Endpoints:
  GET  /context                    → { work_items, workload, trust }
  POST /decision                   → upsert + recompute Bayesian trust → { decision, trust }
  GET  /trust/{category}/explain   → full audit: score breakdown, path to auto, event log
  POST /demo/run                   → scripted agent execution with step-by-step narrative
  GET  /feeds/autonomy             → recent autonomous decisions
  GET  /feeds/escalations          → pending escalations
  GET  /feeds/stats                → dashboard stats: time saved, counts
  GET  /feeds/trust-dashboard      → full trust table with scores + confidence
  GET  /feeds/trust-events         → trust promotion/demotion event log
  GET  /health
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import init_db, get_conn, resolve_tenant, ensure_tenant, DEMO_TENANT
from trust import recompute, recompute_all, explain as trust_explain, autonomy_level
from seed import seed
import langfuse_client as lf_client
from demo import DEMO_ITEMS, build_steps, TIME_PER_CATEGORY

app = FastAPI(title="DailyGate Data API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin key gates tenant provisioning. Set ADMIN_KEY in the deploy env; if unset,
# provisioning is open (fine for the demo, lock it down for real multi-tenancy).
ADMIN_KEY = os.environ.get("ADMIN_KEY", "")


@app.on_event("startup")
def startup():
    init_db()
    seed()


# ── Multi-tenancy: resolve the caller's tenant from the X-Trust-Key header ─────

def tenant(x_trust_key: Optional[str] = Header(default=None)) -> str:
    """
    Every data/trust call is scoped to the tenant that owns the api_key. Each org
    connects the trust integration with its OWN key, so the agent only ever sees —
    and earns — that org's autonomy. Unknown/missing key → 401.
    """
    with get_conn() as conn:
        t = resolve_tenant(conn, x_trust_key)
    if not t:
        raise HTTPException(401, "missing or invalid X-Trust-Key")
    return t


# ── Serialisers ───────────────────────────────────────────────────────────────

def _work_item(r) -> dict:
    return {
        "id":              r["id"],
        "source":          r["source"],
        "title":           r["title"],
        "owner_suggested": r["owner_suggested"],
        "age_days":        r["age_days"],
        "status":          r["status"],
        "is_duplicate_of": r["is_duplicate_of"],
        "type":            r["type"],
    }


def _workload(r) -> dict:
    return {
        "assignee":       r["assignee"],
        "kind":           r["kind"],
        "open_tasks":     r["open_tasks"],
        "est_load_score": r["est_load_score"],
    }


def _trust(r) -> dict:
    """Full trust row. `autonomy_level` is the routing signal Person A's router reads."""
    score      = round(float(r["trust_score"] or 0.33), 3)
    confidence = round(float(r["trust_confidence"] or 0.0), 3)
    ceiling    = bool(r["ceiling"])
    return {
        "category":         r["category"],
        "autonomy_level":   autonomy_level(r["trust_level"], score, confidence, ceiling),
        "ceiling":          ceiling,
        "trust_level":      r["trust_level"],
        "trust_score":      score,
        "trust_confidence": confidence,
        "auto_threshold":   round(float(r["auto_threshold"] or 0.80), 3),
        "risk_profile":     r["risk_profile"] or "medium",
        "approvals_count":  r["approvals_count"],
        "overrides_count":  r["overrides_count"],
        "last_event":       r["last_event"],
    }


def _decision(r) -> dict:
    return {
        "id":               r["id"],
        "item_id":          r["item_id"],
        "category":         r["category"],
        "action":           r["action"],
        "stakes":           r["stakes"],
        "reversible":       bool(r["reversible"]),
        "was_autonomous":   bool(r["was_autonomous"]),
        "manager_response": r["manager_response"],
        "timestamp":        r["timestamp"],
    }


def _trust_event(r) -> dict:
    return {
        "id":          r["id"],
        "category":    r["category"],
        "event_type":  r["event_type"],
        "old_level":   r["old_level"],
        "new_level":   r["new_level"],
        "old_score":   r["old_score"],
        "new_score":   r["new_score"],
        "confidence":  r["confidence"],
        "reason":      r["reason"],
        "decision_id": r["decision_id"],
        "timestamp":   r["timestamp"],
    }


# ── Input model ───────────────────────────────────────────────────────────────

class DecisionInput(BaseModel):
    id: str
    item_id: Optional[str] = None
    category: str
    action: str
    stakes: str
    reversible: bool
    was_autonomous: bool
    manager_response: str


# ── Core endpoints ────────────────────────────────────────────────────────────

@app.get("/context")
def get_context(tn: str = Depends(tenant)):
    """Full snapshot for the caller's tenant. Agent reads this at the top of every run."""
    with get_conn() as conn:
        work_items = [_work_item(r) for r in conn.execute(
            "SELECT * FROM work_item WHERE tenant=?", (tn,)).fetchall()]
        workload   = [_workload(r)  for r in conn.execute(
            "SELECT * FROM workload WHERE tenant=?", (tn,)).fetchall()]
        trust      = [_trust(r)     for r in conn.execute(
            "SELECT * FROM trust WHERE tenant=?", (tn,)).fetchall()]
    return {"tenant": tn, "work_items": work_items, "workload": workload, "trust": trust}


@app.post("/decision")
def post_decision(body: DecisionInput, tn: str = Depends(tenant)):
    """
    Upsert decision by id. Recompute Bayesian trust. Return { decision, trust }.
    Re-called to flip pending→approved/overridden once manager responds.
    Every call emits a Langfuse trace — manager responses become Langfuse Scores,
    closing the human-feedback loop that drives the Bayesian engine.
    """
    valid_stakes    = {"low", "high"}
    valid_responses = {"approved", "overridden", "edited", "pending", "n/a"}

    if body.stakes not in valid_stakes:
        raise HTTPException(400, f"stakes must be one of {valid_stakes}")
    if body.manager_response not in valid_responses:
        raise HTTPException(400, f"manager_response must be one of {valid_responses}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    is_resolution = False  # true when pending→resolved

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT timestamp, manager_response FROM decision WHERE id = ? AND tenant = ?",
            (body.id, tn),
        ).fetchone()
        timestamp = existing["timestamp"] if existing else now
        if existing and existing["manager_response"] == "pending" and body.manager_response != "pending":
            is_resolution = True

        # Capture trust state BEFORE recompute for Langfuse delta tracking
        trust_row_before = conn.execute(
            "SELECT * FROM trust WHERE category = ? AND tenant = ?", (body.category, tn)
        ).fetchone()
        trust_before = _trust(trust_row_before) if trust_row_before else {
            "trust_level": "ask", "trust_score": 0.33, "trust_confidence": 0.0,
            "auto_threshold": 0.80, "risk_profile": "medium",
            "ceiling": False, "approvals_count": 0, "overrides_count": 0,
        }

        conn.execute(
            """INSERT INTO decision
               (tenant, id, item_id, category, action, stakes, reversible,
                was_autonomous, manager_response, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(tenant, id) DO UPDATE SET
                 item_id          = excluded.item_id,
                 category         = excluded.category,
                 action           = excluded.action,
                 stakes           = excluded.stakes,
                 reversible       = excluded.reversible,
                 was_autonomous   = excluded.was_autonomous,
                 manager_response = excluded.manager_response""",
            (
                tn, body.id, body.item_id, body.category, body.action,
                body.stakes, int(body.reversible), int(body.was_autonomous),
                body.manager_response, timestamp,
            ),
        )

        updated_trust = recompute(conn, body.category, tn, decision_id=body.id)
        stored = conn.execute(
            "SELECT * FROM decision WHERE id = ? AND tenant = ?", (body.id, tn)
        ).fetchone()

    trust_out = _trust(updated_trust)

    # ── Langfuse: emit trace or update scores ─────────────────────────────────
    if is_resolution:
        # Manager just resolved a pending escalation — update the existing trace's scores
        lf_client.update_manager_response(
            decision_id=body.id,
            manager_response=body.manager_response,
            category=body.category,
            trust_after=trust_out,
        )
    else:
        # New decision or first-time record — full trace with span + all scores
        lf_client.trace_decision(
            decision_id=body.id,
            category=body.category,
            action=body.action,
            stakes=body.stakes,
            reversible=body.reversible,
            was_autonomous=body.was_autonomous,
            manager_response=body.manager_response,
            trust_before=trust_before,
            trust_after=trust_out,
            timestamp=timestamp,
        )

    return {"decision": _decision(stored), "trust": trust_out}


# ── Trust intelligence endpoints ──────────────────────────────────────────────

@app.get("/trust/{category}/explain")
def explain_trust(category: str, tn: str = Depends(tenant)):
    """
    Full audit for a trust category:
      - current score, confidence, threshold
      - per-decision signal breakdown (time-weighted contributions)
      - recent trust events (promotions, demotions, score updates)
      - plain-English explanation + path to promotion
    """
    with get_conn() as conn:
        return trust_explain(conn, category, tn)


# ── Dashboard feeds ───────────────────────────────────────────────────────────

@app.get("/feeds/autonomy")
def feed_autonomy(limit: int = 20, tn: str = Depends(tenant)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM decision WHERE was_autonomous=1 AND tenant=? ORDER BY timestamp DESC LIMIT ?",
            (tn, limit),
        ).fetchall()
    return {"decisions": [_decision(r) for r in rows]}


@app.get("/feeds/escalations")
def feed_escalations(tn: str = Depends(tenant)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM decision WHERE manager_response='pending' AND tenant=? ORDER BY timestamp DESC",
            (tn,),
        ).fetchall()
    return {"decisions": [_decision(r) for r in rows]}


@app.get("/feeds/trust-dashboard")
def feed_trust_dashboard(tn: str = Depends(tenant)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM trust WHERE tenant=? ORDER BY trust_score DESC", (tn,)
        ).fetchall()
    return {"trust": [_trust(r) for r in rows]}


@app.get("/feeds/trust-events")
def feed_trust_events(limit: int = 50, tn: str = Depends(tenant)):
    """The learning log: every promotion, demotion, and score shift with reasons."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM trust_events WHERE tenant=? ORDER BY timestamp DESC LIMIT ?",
            (tn, limit),
        ).fetchall()
    return {"events": [_trust_event(r) for r in rows]}


@app.get("/feeds/langfuse")
def feed_langfuse():
    """
    Deep-links to Langfuse sessions per trust category.
    Each session shows the full trust arc for that category —
    override → rebuild → earned autonomy — in Langfuse's UI.
    """
    return {"sessions": lf_client.langfuse_links()}


@app.post("/demo/run")
def demo_run(item_id: str = "gh-412", record: bool = True, tn: str = Depends(tenant)):
    """
    Run a scripted demo execution. Returns step-by-step narrative + trust delta.
    If record=true, records the decision and recomputes real Bayesian trust.
    """
    item = DEMO_ITEMS.get(item_id, DEMO_ITEMS["gh-412"])

    with get_conn() as conn:
        trust_row = conn.execute(
            "SELECT * FROM trust WHERE category=? AND tenant=?", (item["category"], tn)
        ).fetchone()

    trust_before = _trust(trust_row) if trust_row else {
        "trust_level": "ask", "trust_score": 0.33, "trust_confidence": 0.0,
        "auto_threshold": 0.80, "risk_profile": "medium", "ceiling": False,
        "autonomy_level": 0, "approvals_count": 0, "overrides_count": 0,
    }

    routing = dict(trust_before)
    routing["tier"] = {0: "OBSERVER", 1: "REVERSIBLE", 2: "ROUTINE"}[trust_before["autonomy_level"]]

    outcome = "ACTED" if (routing["autonomy_level"] >= 2 and not routing["ceiling"]) else "ESCALATED"
    trust_after = trust_before
    decision_id = None

    if record:
        was_autonomous = outcome == "ACTED"
        manager_response = "n/a" if was_autonomous else "pending"
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        decision_id = f"demo-{item_id}-{str(uuid.uuid4())[:8]}"

        with get_conn() as conn:
            conn.execute(
                """INSERT INTO decision
                   (tenant, id, item_id, category, action, stakes, reversible,
                    was_autonomous, manager_response, timestamp)
                   VALUES (?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(tenant, id) DO NOTHING""",
                (tn, decision_id, item["id"], item["category"], item["action"],
                 item["stakes"], int(item["reversible"]), int(was_autonomous),
                 manager_response, now),
            )
            updated = recompute(conn, item["category"], tn, decision_id=decision_id)
        trust_after = _trust(updated)

        lf_client.trace_decision(
            decision_id=decision_id,
            category=item["category"],
            action=item["action"],
            stakes=item["stakes"],
            reversible=item["reversible"],
            was_autonomous=was_autonomous,
            manager_response=manager_response,
            trust_before=trust_before,
            trust_after=trust_after,
            timestamp=now,
        )

    steps = build_steps(item, routing)
    score_delta = trust_after["trust_score"] - trust_before["trust_score"]
    for s in steps:
        if s["type"] == "record":
            s["text"] = (
                f"Trust: {trust_before['trust_score']*100:.0f}% → "
                f"{trust_after['trust_score']*100:.0f}% "
                f"({'+'if score_delta>=0 else ''}{score_delta*100:.1f}%)"
            )

    return {
        "item": item,
        "routing": routing,
        "trust_before": trust_before,
        "trust_after": trust_after,
        "outcome": outcome,
        "time_saved_min": item["time_saved_min"],
        "score_delta": round(score_delta, 4),
        "steps": steps,
    }


@app.get("/feeds/stats")
def feed_stats(tn: str = Depends(tenant)):
    """Dashboard stats for the UI hero: time saved, counts, learning moments."""
    with get_conn() as conn:
        auto_rows = conn.execute(
            "SELECT category, COUNT(*) as n FROM decision WHERE was_autonomous=1 AND tenant=? GROUP BY category",
            (tn,),
        ).fetchall()
        total_auto = sum(r["n"] for r in auto_rows)
        time_saved_min = sum(
            r["n"] * TIME_PER_CATEGORY.get(r["category"], 5) for r in auto_rows
        )
        escalation_count = conn.execute(
            "SELECT COUNT(*) FROM decision WHERE manager_response='pending' AND tenant=?", (tn,)
        ).fetchone()[0]
        total_decisions = conn.execute(
            "SELECT COUNT(*) FROM decision WHERE tenant=?", (tn,)
        ).fetchone()[0]
        promotions = conn.execute(
            "SELECT COUNT(*) FROM trust_events WHERE event_type='promoted' AND tenant=?", (tn,)
        ).fetchone()[0]

    return {
        "total_autonomous": total_auto,
        "total_decisions": total_decisions,
        "time_saved_min": time_saved_min,
        "escalation_count": escalation_count,
        "promotions": promotions,
        "demo_items": list(DEMO_ITEMS.keys()),
    }


# ── Tenant provisioning ───────────────────────────────────────────────────────

# The standard earned-autonomy ladder every new tenant starts with — all gated,
# earning from zero. High-stakes categories start permanently capped (ceiling).
BASELINE_CATEGORIES = [
    "issue-triage", "capacity-assignment", "thank-you-note",
    "nudge", "code-review", "code-fix", "candidate-decision",
]


class TenantInput(BaseModel):
    name: str
    admin_key: Optional[str] = None


@app.post("/tenants")
def create_tenant(body: TenantInput):
    """
    Provision a NEW org. Mints a tenant id + api_key and bootstraps the full
    earned-autonomy ladder — every category gated (observe-only), nothing trusted.
    The org connects the trust integration with the returned api_key and earns its
    OWN autonomy from scratch. Returns the api_key ONCE — store it.
    """
    if ADMIN_KEY and body.admin_key != ADMIN_KEY:
        raise HTTPException(403, "invalid admin_key")

    tenant_id = f"t-{uuid.uuid4().hex[:10]}"
    api_key   = f"dgk_{uuid.uuid4().hex}"

    with get_conn() as conn:
        ensure_tenant(conn, api_key, tenant_id, body.name)
        # Bootstrap the gated ladder so the new org's dashboard shows the full
        # category set at level 0 from day one. recompute() seeds each row.
        for cat in BASELINE_CATEGORIES:
            recompute(conn, cat, tenant_id)

    return {
        "tenant": tenant_id,
        "api_key": api_key,
        "name": body.name,
        "categories": BASELINE_CATEGORIES,
        "note": "Connect the dailygate-trust integration with this api_key as X-Trust-Key. "
                "Every category starts gated (level 0) and earns autonomy as you approve.",
    }


# ── GATHER: pull real GitHub issues into a tenant's work_item table ────────────

class GatherInput(BaseModel):
    repo: str                       # "owner/repo"
    token: Optional[str] = None     # optional GitHub token (private repos / higher limits)


@app.post("/gather")
def gather_repo(body: GatherInput, tn: str = Depends(tenant)):
    """
    Replace this tenant's GitHub work items with the live issues from `repo`.
    Public repos work without a token. Runs the same path the CLI/cron uses.
    """
    import urllib.error
    from gather_github import gather as gh_gather
    repo = body.repo.strip().removeprefix("https://github.com/").strip("/")
    if "/" not in repo:
        raise HTTPException(400, "repo must be 'owner/name'")
    try:
        return gh_gather(repo, tn, body.token or os.environ.get("GITHUB_TOKEN"))
    except urllib.error.HTTPError as e:
        raise HTTPException(502, f"GitHub API {e.code}: {e.reason} for {repo}")
    except Exception as e:
        raise HTTPException(502, f"gather failed: {e}")


@app.get("/health")
def health():
    lf_active = lf_client._client() is not None
    return {"status": "ok", "langfuse": "connected" if lf_active else "not configured"}


@app.get("/whoami")
def whoami(tn: str = Depends(tenant)):
    """Echo the tenant a key resolves to — handy for verifying integration wiring."""
    return {"tenant": tn}
