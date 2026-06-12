"""
Langfuse v4 integration for DailyGate's Bayesian trust engine.

v4 uses OpenTelemetry context managers:
  lf.start_as_current_observation(name=..., as_type="chain"|"span"|...)
  lf.score_current_trace(name=..., value=...)
  lf.create_score(trace_id=..., session_id=..., ...)   ← for scores without a context

What judges see in Langfuse:
  Sessions per category   — trust-category:{category}  (full arc per category)
  Traces                  — one per decision, named decision:{category}
  Spans                   — bayesian-trust-recompute inside each trace
  Scores over time        — trust-score, manager-feedback, autonomy-level, earned-autonomy-delta
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

FEEDBACK_SCORES: Dict[str, Optional[float]] = {
    "approved":   1.0,
    "n/a":        0.75,
    "edited":     0.30,
    "overridden": 0.0,
    "pending":    None,
}

_lf = None


def _client():
    global _lf
    if _lf is not None:
        return _lf
    pk = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    sk = os.environ.get("LANGFUSE_SECRET_KEY", "")
    if not pk or not sk:
        return None
    try:
        from langfuse import Langfuse
        host = (
            os.environ.get("LANGFUSE_HOST")
            or os.environ.get("LANGFUSE_BASE_URL")
            or "https://cloud.langfuse.com"
        )
        _lf = Langfuse(public_key=pk, secret_key=sk, host=host)
        logger.info(f"Langfuse: connected to {host}")
        return _lf
    except Exception as exc:
        logger.warning(f"Langfuse: init failed — {exc}")
        return None


def _parse_ts(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _event_type(before: Dict, after: Dict) -> str:
    b, a = before.get("trust_level"), after.get("trust_level")
    if b == "ask" and a == "auto":
        return "promoted"
    if b == "auto" and a == "ask":
        return "demoted"
    return "stable"


# ── Public API ────────────────────────────────────────────────────────────────

def trace_decision(
    decision_id: str,
    category: str,
    action: str,
    stakes: str,
    reversible: bool,
    was_autonomous: bool,
    manager_response: str,
    trust_before: Dict[str, Any],
    trust_after: Dict[str, Any],
    timestamp: Optional[str] = None,
) -> None:
    """
    Emit one Langfuse trace per decision.

    Structure:
      Trace  "decision:{category}"  (chain)
        └── Span  "bayesian-trust-recompute"  (evaluator)

    Scores on the trace:
      trust-score            0-1  Bayesian posterior after this decision
      trust-confidence       0-1  effective sample-size confidence
      manager-feedback       1=approved / 0.3=edited / 0=overridden
      autonomy-level         1=auto  0=ask
      earned-autonomy-delta  +1=promoted  -1=demoted  0=stable
    """
    lf = _client()
    if not lf:
        return

    try:
        event        = _event_type(trust_before, trust_after)
        score_before = float(trust_before.get("trust_score") or 0.33)
        score_after  = float(trust_after.get("trust_score") or 0.33)
        conf_after   = float(trust_after.get("trust_confidence") or 0.0)
        feedback     = FEEDBACK_SCORES.get(manager_response)
        session_id   = f"trust-category:{category}"
        ts           = _parse_ts(timestamp)

        tags = [
            category, stakes,
            "autonomous" if was_autonomous else "escalated",
            f"trust:{trust_after.get('trust_level', 'ask')}",
            f"risk:{trust_after.get('risk_profile', 'medium')}",
        ]
        if trust_after.get("ceiling"):
            tags.append("ceiling")
        if event != "stable":
            tags.append(event)

        # ── Outer trace (chain = multi-step decision process) ─────────────
        trace_kwargs: Dict[str, Any] = dict(
            name=f"decision:{category}",
            as_type="chain",
            input={
                "category":         category,
                "action":           action,
                "stakes":           stakes,
                "reversible":       reversible,
                "was_autonomous":   was_autonomous,
                "manager_response": manager_response,
            },
            metadata={
                "trust_before":   trust_before,
                "risk_profile":   trust_after.get("risk_profile", "medium"),
                "ceiling":        bool(trust_after.get("ceiling", False)),
                "auto_threshold": trust_after.get("auto_threshold"),
                "session_id":     session_id,   # surfaced in metadata for traceability
                "decision_id":    decision_id,
            },
        )
        with lf.start_as_current_observation(**trace_kwargs) as obs:

            # ── Inner span: trust recompute ───────────────────────────────
            with lf.start_as_current_observation(
                name="bayesian-trust-recompute",
                as_type="evaluator",
                input={
                    "trust_score_before": round(score_before, 3),
                    "conf_before":        round(float(trust_before.get("trust_confidence") or 0), 3),
                    "approvals_before":   trust_before.get("approvals_count", 0),
                    "overrides_before":   trust_before.get("overrides_count", 0),
                    "signal":             manager_response,
                    "was_autonomous":     was_autonomous,
                },
            ) as span:
                span.update(output={
                    "trust_score_after": round(score_after, 3),
                    "conf_after":        round(conf_after, 3),
                    "score_delta":       round(score_after - score_before, 3),
                    "event_type":        event,
                    "new_trust_level":   trust_after.get("trust_level"),
                })

            obs.update(output={
                "trust_level":      trust_after.get("trust_level"),
                "trust_score":      round(score_after, 3),
                "trust_confidence": round(conf_after, 3),
                "event":            event,
            })

            # ── Scores on the trace (inside context = linked correctly) ───
            lf.score_current_trace(
                name="trust-score",
                value=round(score_after, 3),
                comment=(
                    f"{category} — {trust_after.get('trust_level')} "
                    f"(conf={conf_after:.2f}, threshold={trust_after.get('auto_threshold', 0.8):.2f})"
                ),
            )
            lf.score_current_trace(
                name="trust-confidence",
                value=round(conf_after, 3),
            )
            lf.score_current_trace(
                name="autonomy-level",
                value=1.0 if trust_after.get("trust_level") == "auto" else 0.0,
                comment=f"trust_level={trust_after.get('trust_level')}",
            )
            lf.score_current_trace(
                name="earned-autonomy-delta",
                value=1.0 if event == "promoted" else (-1.0 if event == "demoted" else 0.0),
                comment=f"event={event}",
            )
            if feedback is not None:
                lf.score_current_trace(
                    name="manager-feedback",
                    value=feedback,
                    comment=f"manager_response={manager_response}",
                )

        # Post session-level scores (no trace_id — these aggregate per category session)
        lf.create_score(session_id=session_id, name="trust-score", value=round(score_after, 3))
        if feedback is not None:
            lf.create_score(session_id=session_id, name="manager-feedback", value=feedback)
        lf.create_score(session_id=session_id, name="autonomy-level",
                        value=1.0 if trust_after.get("trust_level") == "auto" else 0.0)

        lf.flush()

    except Exception as exc:
        logger.warning(f"Langfuse: trace_decision failed — {exc}")


def update_manager_response(
    decision_id: str,
    manager_response: str,
    category: str,
    trust_after: Dict[str, Any],
) -> None:
    """
    Post updated feedback + trust scores when a pending escalation resolves.
    Uses session_id so scores appear in the category's trust arc session,
    even though we no longer hold the OTel context for the original trace.
    """
    lf = _client()
    if not lf:
        return
    try:
        session_id = f"trust-category:{category}"
        score      = round(float(trust_after.get("trust_score") or 0.33), 3)
        feedback   = FEEDBACK_SCORES.get(manager_response)

        if feedback is not None:
            lf.create_score(
                session_id=session_id,
                name="manager-feedback",
                value=feedback,
                comment=f"Resolved: {manager_response}",
            )
        lf.create_score(
            session_id=session_id,
            name="trust-score",
            value=score,
            comment=f"After resolution: {trust_after.get('trust_level')}",
        )
        lf.create_score(
            session_id=session_id,
            name="autonomy-level",
            value=1.0 if trust_after.get("trust_level") == "auto" else 0.0,
        )
        lf.flush()
    except Exception as exc:
        logger.warning(f"Langfuse: update_manager_response failed — {exc}")


def seed_history_to_langfuse(conn) -> None:
    """
    Push seeded historical decisions to Langfuse on startup.
    Pre-populates the dashboard so judges see the full trust arc immediately.
    """
    lf = _client()
    if not lf:
        logger.info("Langfuse: no credentials — skipping historical seed.")
        return

    logger.info("Langfuse: pushing historical decisions...")
    try:
        rows = conn.execute("""
            SELECT d.*,
                   t.trust_score, t.trust_confidence, t.trust_level,
                   t.auto_threshold, t.risk_profile, t.ceiling,
                   t.approvals_count, t.overrides_count
            FROM decision d
            JOIN trust t ON t.category = d.category
            ORDER BY d.timestamp
        """).fetchall()

        trust_snapshot: Dict[str, Dict] = {}
        for row in rows:
            d   = dict(row)
            cat = d["category"]

            trust_before = trust_snapshot.get(cat, {
                "trust_level":      "ask",
                "trust_score":      0.33,
                "trust_confidence": 0.0,
                "auto_threshold":   d.get("auto_threshold", 0.80),
                "risk_profile":     d.get("risk_profile", "medium"),
                "ceiling":          bool(d.get("ceiling", False)),
                "approvals_count":  0,
                "overrides_count":  0,
            })
            trust_after = {
                "category":         cat,
                "trust_level":      d["trust_level"],
                "trust_score":      d["trust_score"],
                "trust_confidence": d["trust_confidence"],
                "auto_threshold":   d["auto_threshold"],
                "risk_profile":     d["risk_profile"],
                "ceiling":          bool(d["ceiling"]),
                "approvals_count":  d["approvals_count"],
                "overrides_count":  d["overrides_count"],
            }

            trace_decision(
                decision_id=d["id"],
                category=cat,
                action=d["action"],
                stakes=d["stakes"],
                reversible=bool(d["reversible"]),
                was_autonomous=bool(d["was_autonomous"]),
                manager_response=d["manager_response"],
                trust_before=trust_before,
                trust_after=trust_after,
                timestamp=d["timestamp"],
            )
            trust_snapshot[cat] = trust_after

        lf.flush()
        logger.info(f"Langfuse: pushed {len(rows)} historical decisions.")
    except Exception as exc:
        logger.warning(f"Langfuse: historical seed failed — {exc}")


def langfuse_links() -> Dict[str, str]:
    """Deep-links to the Langfuse session for each trust category."""
    host = (
        os.environ.get("LANGFUSE_HOST")
        or os.environ.get("LANGFUSE_BASE_URL")
        or "https://cloud.langfuse.com"
    ).rstrip("/")
    categories = [
        "issue-triage", "capacity-assignment", "thank-you-note",
        "nudge", "code-review", "candidate-decision",
    ]
    return {cat: f"{host}/sessions/trust-category:{cat}" for cat in categories}
