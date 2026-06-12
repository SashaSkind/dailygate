"""
DailyGate — Data + Trust API (Person B).

Endpoints:
  GET  /context                    → { work_items, workload, trust }
  POST /decision                   → upsert + recompute Bayesian trust → { decision, trust }
  GET  /trust/{category}/explain   → full audit: score breakdown, path to auto, event log
  GET  /feeds/autonomy             → recent autonomous decisions
  GET  /feeds/escalations          → pending escalations
  GET  /feeds/trust-dashboard      → full trust table with scores + confidence
  GET  /feeds/trust-events         → trust promotion/demotion event log
  GET  /health
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import init_db, get_conn
from trust import recompute, recompute_all, explain as trust_explain, autonomy_level
from seed import seed

app = FastAPI(title="DailyGate Data API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()
    seed()


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
def get_context():
    """Full snapshot. Agent reads this at the top of every run."""
    with get_conn() as conn:
        work_items = [_work_item(r) for r in conn.execute("SELECT * FROM work_item").fetchall()]
        workload   = [_workload(r)  for r in conn.execute("SELECT * FROM workload").fetchall()]
        trust      = [_trust(r)     for r in conn.execute("SELECT * FROM trust").fetchall()]
    return {"work_items": work_items, "workload": workload, "trust": trust}


@app.post("/decision")
def post_decision(body: DecisionInput):
    """
    Upsert decision by id. Recompute Bayesian trust. Return { decision, trust }.
    Re-called to flip pending→approved/overridden once manager responds.
    """
    valid_stakes    = {"low", "high"}
    valid_responses = {"approved", "overridden", "edited", "pending", "n/a"}

    if body.stakes not in valid_stakes:
        raise HTTPException(400, f"stakes must be one of {valid_stakes}")
    if body.manager_response not in valid_responses:
        raise HTTPException(400, f"manager_response must be one of {valid_responses}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    with get_conn() as conn:
        existing = conn.execute(
            "SELECT timestamp FROM decision WHERE id = ?", (body.id,)
        ).fetchone()
        timestamp = existing["timestamp"] if existing else now

        conn.execute(
            """INSERT INTO decision
               (id, item_id, category, action, stakes, reversible,
                was_autonomous, manager_response, timestamp)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 item_id          = excluded.item_id,
                 category         = excluded.category,
                 action           = excluded.action,
                 stakes           = excluded.stakes,
                 reversible       = excluded.reversible,
                 was_autonomous   = excluded.was_autonomous,
                 manager_response = excluded.manager_response""",
            (
                body.id, body.item_id, body.category, body.action,
                body.stakes, int(body.reversible), int(body.was_autonomous),
                body.manager_response, timestamp,
            ),
        )

        updated_trust = recompute(conn, body.category, decision_id=body.id)
        stored = conn.execute("SELECT * FROM decision WHERE id = ?", (body.id,)).fetchone()

    return {
        "decision": _decision(stored),
        "trust":    _trust(updated_trust) if isinstance(updated_trust, dict)
                    else {k: updated_trust[k] for k in updated_trust.keys()},
    }


# ── Trust intelligence endpoints ──────────────────────────────────────────────

@app.get("/trust/{category}/explain")
def explain_trust(category: str):
    """
    Full audit for a trust category:
      - current score, confidence, threshold
      - per-decision signal breakdown (time-weighted contributions)
      - recent trust events (promotions, demotions, score updates)
      - plain-English explanation + path to promotion
    """
    with get_conn() as conn:
        return trust_explain(conn, category)


# ── Dashboard feeds ───────────────────────────────────────────────────────────

@app.get("/feeds/autonomy")
def feed_autonomy(limit: int = 20):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM decision WHERE was_autonomous=1 ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return {"decisions": [_decision(r) for r in rows]}


@app.get("/feeds/escalations")
def feed_escalations():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM decision WHERE manager_response='pending' ORDER BY timestamp DESC"
        ).fetchall()
    return {"decisions": [_decision(r) for r in rows]}


@app.get("/feeds/trust-dashboard")
def feed_trust_dashboard():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM trust ORDER BY trust_score DESC"
        ).fetchall()
    return {"trust": [_trust(r) for r in rows]}


@app.get("/feeds/trust-events")
def feed_trust_events(limit: int = 50):
    """The learning log: every promotion, demotion, and score shift with reasons."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM trust_events ORDER BY timestamp DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return {"events": [_trust_event(r) for r in rows]}


@app.get("/health")
def health():
    return {"status": "ok"}
