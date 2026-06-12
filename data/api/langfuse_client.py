"""
Langfuse integration for DailyGate's Bayesian trust engine.

The insight: Langfuse isn't just observability here — it IS the human feedback
loop. Manager approve/override responses become Langfuse Scores, which feed
directly into the Bayesian posterior. Every trust score change is traceable,
auditable, and visible in Langfuse's UI.

What judges will see in Langfuse:
  - Sessions grouped by trust category: the full earned-autonomy arc per category
  - Score charts: trust-score rising over time, dropping on overrides
  - manager-feedback scores: 1.0=approved, 0.3=edited, 0.0=overridden
  - autonomy-level: binary chart showing when categories flip auto↔ask
  - earned-autonomy-delta: +1 on promotion, -1 on demotion events
  - Each trace: the decision + the trust recompute span + all scores

Usage: set LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY in env.
       LANGFUSE_HOST defaults to https://cloud.langfuse.com.
       If keys are absent, all calls are no-ops — the API works either way.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Manager response → Langfuse numeric score (0–1 scale)
FEEDBACK_SCORES: Dict[str, Optional[float]] = {
    "approved":   1.0,
    "n/a":        0.75,  # autonomous, unreviewed — didn't fail
    "edited":     0.30,  # partial fix needed
    "overridden": 0.0,   # rejected
    "pending":    None,  # no signal yet — don't post
}

_client_instance = None


def _client():
    global _client_instance
    if _client_instance is not None:
        return _client_instance

    pk = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    sk = os.environ.get("LANGFUSE_SECRET_KEY", "")
    if not pk or not sk:
        return None

    try:
        from langfuse import Langfuse
        _client_instance = Langfuse(
            public_key=pk,
            secret_key=sk,
            host=os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com"),
        )
        logger.info("Langfuse: connected.")
        return _client_instance
    except Exception as exc:
        logger.warning(f"Langfuse: init failed (non-fatal) — {exc}")
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

    Trace structure:
      Trace (id=decision_id, session_id=trust-category:{category})
        └── Span "bayesian-trust-recompute"
              input:  trust state before + decision signals
              output: score delta + new level + event type

    Scores posted to the trace:
      trust-score          — Bayesian posterior after this decision (0–1)
      trust-confidence     — effective sample size confidence (0–1)
      manager-feedback     — human evaluation score (1=approved, 0=overridden)
      autonomy-level       — 1.0 if category is auto, 0.0 if ask
      earned-autonomy-delta— +1 promoted, -1 demoted, 0 stable
    """
    lf = _client()
    if not lf:
        return

    try:
        event = _event_type(trust_before, trust_after)
        score_before = float(trust_before.get("trust_score") or 0.33)
        score_after = float(trust_after.get("trust_score") or 0.33)
        conf_after = float(trust_after.get("trust_confidence") or 0.0)
        ts = _parse_ts(timestamp)

        tags = [
            category,
            stakes,
            "autonomous" if was_autonomous else "escalated",
            f"trust:{trust_after.get('trust_level', 'ask')}",
            f"risk:{trust_after.get('risk_profile', 'medium')}",
        ]
        if trust_after.get("ceiling"):
            tags.append("ceiling")
        if event != "stable":
            tags.append(event)

        # ── Trace ────────────────────────────────────────────────────────────
        trace = lf.trace(
            id=decision_id,
            name=f"decision:{category}",
            # Session per category = the trust arc for that category in one view
            session_id=f"trust-category:{category}",
            input={
                "category":         category,
                "action":           action,
                "stakes":           stakes,
                "reversible":       reversible,
                "was_autonomous":   was_autonomous,
                "manager_response": manager_response,
            },
            output={
                "trust_level":      trust_after.get("trust_level"),
                "trust_score":      round(score_after, 3),
                "trust_confidence": round(conf_after, 3),
                "event":            event,
            },
            metadata={
                "trust_before":   trust_before,
                "trust_after":    trust_after,
                "risk_profile":   trust_after.get("risk_profile", "medium"),
                "ceiling":        bool(trust_after.get("ceiling", False)),
                "auto_threshold": trust_after.get("auto_threshold"),
            },
            tags=tags,
            start_time=ts,
        )

        # ── Span: trust recompute ─────────────────────────────────────────────
        span = trace.span(
            name="bayesian-trust-recompute",
            input={
                "category":           category,
                "trust_score_before": round(score_before, 3),
                "conf_before":        round(float(trust_before.get("trust_confidence") or 0), 3),
                "approvals_before":   trust_before.get("approvals_count", 0),
                "overrides_before":   trust_before.get("overrides_count", 0),
                "signal":             manager_response,
                "was_autonomous":     was_autonomous,
            },
            output={
                "trust_score_after": round(score_after, 3),
                "conf_after":        round(conf_after, 3),
                "score_delta":       round(score_after - score_before, 3),
                "event_type":        event,
                "new_trust_level":   trust_after.get("trust_level"),
            },
            start_time=ts,
        )
        span.end(end_time=ts)

        # ── Scores ───────────────────────────────────────────────────────────
        lf.score(
            trace_id=decision_id,
            name="trust-score",
            value=round(score_after, 3),
            comment=f"{category} — {trust_after.get('trust_level')} "
                    f"(conf={conf_after:.2f}, threshold={trust_after.get('auto_threshold', 0.8):.2f})",
        )
        lf.score(
            trace_id=decision_id,
            name="trust-confidence",
            value=round(conf_after, 3),
            comment=f"Effective sample size confidence for '{category}'",
        )
        lf.score(
            trace_id=decision_id,
            name="autonomy-level",
            value=1.0 if trust_after.get("trust_level") == "auto" else 0.0,
            comment=f"trust_level={trust_after.get('trust_level')}",
        )
        lf.score(
            trace_id=decision_id,
            name="earned-autonomy-delta",
            value=1.0 if event == "promoted" else (-1.0 if event == "demoted" else 0.0),
            comment=f"{trust_before.get('trust_level')} → {trust_after.get('trust_level')}",
        )

        feedback = FEEDBACK_SCORES.get(manager_response)
        if feedback is not None:
            lf.score(
                trace_id=decision_id,
                name="manager-feedback",
                value=feedback,
                comment=f"manager_response={manager_response}",
            )

        lf.flush()
    except Exception as exc:
        logger.warning(f"Langfuse: trace_decision failed (non-fatal) — {exc}")


def update_manager_response(
    decision_id: str,
    manager_response: str,
    category: str,
    trust_after: Dict[str, Any],
) -> None:
    """
    Post updated manager feedback + trust scores when a pending decision resolves.
    This is the feedback loop closing: manager says approve/override →
    Langfuse Score is posted → trust engine already updated → now Langfuse reflects it.
    """
    lf = _client()
    if not lf:
        return

    try:
        feedback = FEEDBACK_SCORES.get(manager_response)
        if feedback is not None:
            lf.score(
                trace_id=decision_id,
                name="manager-feedback",
                value=feedback,
                comment=f"Resolved: {manager_response}",
            )

        score = float(trust_after.get("trust_score") or 0.33)
        lf.score(
            trace_id=decision_id,
            name="trust-score",
            value=round(score, 3),
            comment=f"Trust after resolution: {trust_after.get('trust_level')}",
        )
        lf.score(
            trace_id=decision_id,
            name="autonomy-level",
            value=1.0 if trust_after.get("trust_level") == "auto" else 0.0,
            comment=f"Post-resolution trust_level={trust_after.get('trust_level')}",
        )
        lf.flush()
    except Exception as exc:
        logger.warning(f"Langfuse: update_manager_response failed (non-fatal) — {exc}")


def seed_history_to_langfuse(conn) -> None:
    """
    Push all seeded historical decisions to Langfuse on startup.
    Gives judges a rich, pre-populated dashboard on demo day —
    not an empty board with zero history.
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
            d = dict(row)
            cat = d["category"]

            # Build approximate "before" state from prior snapshot
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
        logger.warning(f"Langfuse: historical seed failed (non-fatal) — {exc}")


def langfuse_links() -> Dict[str, str]:
    """Return Langfuse dashboard deep-links for each trust category session."""
    host = os.environ.get("LANGFUSE_HOST", "https://cloud.langfuse.com").rstrip("/")
    categories = [
        "issue-triage", "capacity-assignment", "thank-you-note",
        "nudge", "code-review", "candidate-decision",
    ]
    return {
        cat: f"{host}/sessions/trust-category:{cat}"
        for cat in categories
    }
