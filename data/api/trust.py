"""
Bayesian Self-Improving Trust Engine for DailyGate.

Core model: Beta-Binomial posterior with time decay.
  - Each decision contributes a time-decayed signal (quality × recency weight)
  - trust_score = weighted_alpha / (weighted_alpha + weighted_beta)  [Beta MAP estimate]
  - trust_confidence = f(effective sample size) — distinguishes "3 approvals" from "50 approvals"
  - auto_threshold is dynamic: base (by risk profile) ± team calibration
  - Team calibration: globally low override rate → lower bar; cautious team → higher bar
  - New categories bootstrap from keyword patterns — no cold start

Frozen contract constants (must match Person A):
  N = 3, load > 70, override → ask, ceiling → never promotes
  These are preserved via the trust_level field which Person A reads.
"""

import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# ── Frozen contract (Person A reads trust_level, so these rules map onto it) ─
CONSECUTIVE_APPROVALS_NEEDED = 3  # Legacy constant kept for contract docs

# ── Bayesian priors ───────────────────────────────────────────────────────────
# Neutral prior (1,1) means "no assumption" — the data speaks for itself.
# A more skeptical (1,2) prior works better for larger teams with more history.
PRIOR_ALPHA = 1.0
PRIOR_BETA  = 1.0

# ── Signal quality: how much each manager_response moves the posterior ────────
# Positive → increments alpha (trust), negative → increments beta (distrust)
SIGNAL_QUALITY: Dict[str, float] = {
    "approved":   1.00,  # Manager explicitly said "correct" — strong signal
    "n/a":        0.50,  # Agent acted, no complaint — meaningful but unreviewed
    "edited":    -0.40,  # Manager had to fix something — partial failure
    "overridden": -1.00, # Manager rejected — strong negative signal
    "pending":    0.00,  # No signal yet
}

# ── Time decay ────────────────────────────────────────────────────────────────
DEFAULT_DECAY_HALF_LIFE = 30  # Decisions from 30 days ago count half as much

# ── Confidence saturation ─────────────────────────────────────────────────────
# Reaches ~50% confidence at 4 effective decisions, ~80% at 16.
CONFIDENCE_SATURATION_N = 4

# ── Confidence gate: prevents promotion on a single lucky approval ────────────
MINIMUM_CONFIDENCE_TO_PROMOTE = 0.20  # ~1.25 effective decisions minimum

# ── Risk thresholds: score the category must reach to go auto ─────────────────
RISK_THRESHOLDS: Dict[str, float] = {
    "low":    0.70,
    "medium": 0.80,
    "high":   0.92,
}

# ── Reversible band: score to earn level-1 (reversible writes) below the auto bar ─
REVERSIBLE_BAND = 0.55

# ── Category bootstrap: keyword → risk profile ───────────────────────────────
# Ordered by specificity (first match wins)
CATEGORY_RISK_PATTERNS = [
    (["candidate", "hire", "fire", "salary", "budget", "legal", "terminate",
      "promote", "demotion", "raise", "offer"], "high"),
    (["deploy", "release", "rollback", "migration", "schema", "production",
      "incident", "outage", "escalate"], "high"),
    (["assign", "triage", "label", "route", "close", "duplicate",
      "auto-close", "tag"], "low"),
    (["nudge", "remind", "notify", "thank", "note", "ping",
      "follow-up", "onboard", "welcome"], "low"),
    (["review", "merge", "approve", "reject", "feedback"], "medium"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _days_ago(timestamp: str) -> float:
    try:
        dt = datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 86400)
    except Exception:
        return 0.0


def _time_weight(days_ago: float, half_life: float) -> float:
    """Exponential decay: w = 2^(-days/half_life)."""
    return math.exp(-math.log(2) * days_ago / max(half_life, 1.0))


def _infer_risk_profile(category: str) -> str:
    lower = category.lower()
    for keywords, risk in CATEGORY_RISK_PATTERNS:
        if any(kw in lower for kw in keywords):
            return risk
    return "medium"


def _get_team_override_rate(conn) -> float:
    """
    Global override rate across all non-ceiling categories — the team's culture signal.
    Trusting teams (low override rate) get lower auto thresholds.
    Cautious teams (high override rate) get higher thresholds.
    """
    row = conn.execute("""
        SELECT
            SUM(CASE WHEN d.manager_response IN ('overridden','edited') THEN 1.0 ELSE 0 END) AS overrides,
            COUNT(*) AS total
        FROM decision d
        JOIN trust t ON t.category = d.category
        WHERE t.ceiling = 0
          AND d.manager_response NOT IN ('pending', 'n/a')
    """).fetchone()
    if not row or not row["total"]:
        return 0.10
    return float(row["overrides"]) / float(row["total"])


def _compute_bayesian_score(
    conn, category: str, half_life: float
) -> tuple[float, float, float, float]:
    """
    Compute (weighted_alpha, weighted_beta, trust_score, trust_confidence).

    Uses the full decision history with time-decay weighting and signal quality.
    trust_score is the Beta distribution MAP estimate.
    trust_confidence saturates as effective sample size grows.
    """
    rows = conn.execute(
        """SELECT manager_response, was_autonomous, timestamp
           FROM decision WHERE category = ? ORDER BY timestamp DESC""",
        (category,),
    ).fetchall()

    alpha = PRIOR_ALPHA
    beta  = PRIOR_BETA
    effective_n = 0.0

    for row in rows:
        mr   = row["manager_response"]
        auto = bool(row["was_autonomous"])
        days = _days_ago(row["timestamp"])
        tw   = _time_weight(days, half_life)

        # Autonomous decisions with no review are treated as "n/a" quality
        key = ("n/a" if (mr == "n/a" and auto) else mr)
        quality = SIGNAL_QUALITY.get(key, 0.0)

        if quality > 0:
            alpha += quality * tw
            effective_n += tw
        elif quality < 0:
            beta += abs(quality) * tw
            effective_n += tw

    n = alpha + beta
    score = alpha / n if n > 0 else 0.5

    # Confidence: logistic saturation — reaches ~0.50 at CONFIDENCE_SATURATION_N
    # and approaches 1.0 asymptotically
    confidence = 1.0 - 1.0 / (1.0 + effective_n / max(CONFIDENCE_SATURATION_N, 1.0))

    return alpha, beta, score, confidence


def _compute_threshold(risk_profile: str, team_override_rate: float) -> float:
    """
    Dynamic auto-threshold = base(risk) ± team calibration.

    Team calibration:
      override_rate < 5%  → −0.05 (trusting team: lower bar)
      override_rate > 20% → +0.05 (cautious team: higher bar)
    """
    base = RISK_THRESHOLDS.get(risk_profile, 0.80)
    if team_override_rate < 0.05:
        calibration = -0.05
    elif team_override_rate > 0.20:
        calibration = +0.05
    else:
        calibration = 0.0
    return max(0.50, min(0.97, base + calibration))


def _raw_counts(conn, category: str) -> Dict[str, int]:
    row = conn.execute(
        """SELECT
             SUM(CASE WHEN manager_response='approved' OR was_autonomous=1 THEN 1 ELSE 0 END) AS approvals,
             SUM(CASE WHEN manager_response IN ('overridden','edited') THEN 1 ELSE 0 END) AS overrides
           FROM decision WHERE category = ?""",
        (category,),
    ).fetchone()
    return {
        "approvals": int(row["approvals"] or 0),
        "overrides": int(row["overrides"] or 0),
    }


def _log_event(
    conn, category: str, event_type: str,
    old_level: Optional[str], new_level: Optional[str],
    old_score: Optional[float], new_score: float, confidence: float,
    reason: str, decision_id: Optional[str],
) -> None:
    conn.execute(
        """INSERT INTO trust_events
           (id, category, event_type, old_level, new_level, old_score,
            new_score, confidence, reason, decision_id, timestamp)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            str(uuid.uuid4()), category, event_type,
            old_level, new_level, old_score, new_score,
            confidence, reason, decision_id, _now_ts(),
        ),
    )


# ── Public API ────────────────────────────────────────────────────────────────

def autonomy_level(trust_level: str, trust_score: float,
                   trust_confidence: float, ceiling: bool) -> int:
    """
    Map the Bayesian trust state onto the agent-lane permission ladder that the
    router reads:
      0 observer  (read-only)
      1 reversible (comment / label / nudge)
      2 routine    (assign / close / send email)

    Level 2 == "auto" — already gated by threshold + confidence + override-demotion
    inside recompute(). Level 1 is the reversible middle band: enough trust to make
    low-stakes reversible writes, but below the auto bar. Ceiling caps at 0.
    """
    if ceiling:
        return 0
    if trust_level == "auto":
        return 2
    if trust_confidence >= MINIMUM_CONFIDENCE_TO_PROMOTE and trust_score >= REVERSIBLE_BAND:
        return 1
    return 0


def get_or_create_trust(conn, category: str) -> Dict[str, Any]:
    row = conn.execute("SELECT * FROM trust WHERE category = ?", (category,)).fetchone()
    if row:
        return dict(row)

    risk_profile = _infer_risk_profile(category)
    threshold    = RISK_THRESHOLDS.get(risk_profile, 0.80)
    conn.execute(
        """INSERT INTO trust
           (category, trust_level, trust_score, trust_confidence, auto_threshold,
            decay_half_life, approvals_count, overrides_count, ceiling, risk_profile, last_event)
           VALUES (?, 'ask', 0.33, 0.0, ?, ?, 0, 0, 0, ?, ?)""",
        (category, threshold, DEFAULT_DECAY_HALF_LIFE, risk_profile,
         f"Bootstrapped — risk={risk_profile}, threshold={threshold:.2f}"),
    )
    _log_event(
        conn, category, "created", None, "ask", None, 0.33, 0.0,
        f"New category '{category}' bootstrapped — inferred risk: {risk_profile}, "
        f"threshold: {threshold:.2f}",
        None,
    )
    return dict(conn.execute("SELECT * FROM trust WHERE category = ?", (category,)).fetchone())


def recompute(conn, category: str, decision_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Recompute the trust row for `category` after a new decision.

    Steps:
      1. Fetch/create trust row
      2. Ceiling → record counts only, never change level
      3. Compute Bayesian score (time-decayed) + confidence
      4. Compute dynamic threshold (risk profile × team culture)
      5. Check for immediate override demotion
      6. Determine new trust_level
      7. Log trust_event if level or score changed meaningfully
      8. Persist and return updated row
    """
    t = get_or_create_trust(conn, category)

    if t["ceiling"]:
        counts = _raw_counts(conn, category)
        conn.execute(
            "UPDATE trust SET approvals_count=?, overrides_count=? WHERE category=?",
            (counts["approvals"], counts["overrides"], category),
        )
        t["approvals_count"] = counts["approvals"]
        t["overrides_count"]  = counts["overrides"]
        return t

    half_life   = t.get("decay_half_life") or DEFAULT_DECAY_HALF_LIFE
    team_rate   = _get_team_override_rate(conn)
    _, _, new_score, confidence = _compute_bayesian_score(conn, category, half_life)
    threshold   = _compute_threshold(t.get("risk_profile", "medium"), team_rate)

    old_level = t["trust_level"]
    old_score = float(t.get("trust_score") or 0.5)

    # Immediate demotion: most recent decision was an override
    latest = conn.execute(
        "SELECT manager_response FROM decision WHERE category=? ORDER BY timestamp DESC LIMIT 1",
        (category,),
    ).fetchone()
    immediate_demotion = bool(
        latest and latest["manager_response"] in ("overridden", "edited")
    )

    if immediate_demotion:
        new_level = "ask"
    elif new_score >= threshold and confidence >= MINIMUM_CONFIDENCE_TO_PROMOTE:
        new_level = "auto"
    else:
        new_level = "ask"

    counts = _raw_counts(conn, category)

    # Build event reason and log
    if new_level != old_level:
        if new_level == "auto":
            reason = (
                f"Promoted to auto — score {new_score:.2f} ≥ threshold {threshold:.2f}, "
                f"confidence {confidence:.2f} ({counts['approvals']} approvals, "
                f"{counts['overrides']} overrides, team override rate {team_rate:.1%})"
            )
        elif immediate_demotion:
            reason = (
                f"Demoted to ask — override detected. "
                f"Score {old_score:.2f} → {new_score:.2f}. Trust streak reset."
            )
        else:
            reason = (
                f"Reverted to ask — score {new_score:.2f} < threshold {threshold:.2f} "
                f"(confidence {confidence:.2f})"
            )
        _log_event(
            conn, category,
            "promoted" if new_level == "auto" else "demoted",
            old_level, new_level, old_score, new_score, confidence,
            reason, decision_id,
        )
    elif abs(new_score - old_score) > 0.02:
        direction = "↑" if new_score > old_score else "↓"
        _log_event(
            conn, category, "score_updated",
            old_level, new_level, old_score, new_score, confidence,
            f"Score {direction} {old_score:.2f} → {new_score:.2f} "
            f"(threshold: {threshold:.2f}, confidence: {confidence:.2f})",
            decision_id,
        )

    last_event_str = (
        f"score={new_score:.2f}, confidence={confidence:.2f}, "
        f"threshold={threshold:.2f}, level={new_level}"
    )
    conn.execute(
        """UPDATE trust SET
             trust_level=?, trust_score=?, trust_confidence=?,
             auto_threshold=?, approvals_count=?, overrides_count=?,
             last_event=?
           WHERE category=?""",
        (
            new_level, new_score, confidence, threshold,
            counts["approvals"], counts["overrides"],
            last_event_str, category,
        ),
    )

    t.update({
        "trust_level":      new_level,
        "trust_score":      new_score,
        "trust_confidence": confidence,
        "auto_threshold":   threshold,
        "approvals_count":  counts["approvals"],
        "overrides_count":  counts["overrides"],
        "last_event":       last_event_str,
    })
    return t


def recompute_all(conn) -> None:
    """Bootstrap trust scores for all categories from their full decision history."""
    categories = [r[0] for r in conn.execute("SELECT category FROM trust").fetchall()]
    for cat in categories:
        recompute(conn, cat)


def explain(conn, category: str) -> Dict[str, Any]:
    """
    Human-readable audit trail: why this category has its current trust level,
    what drove it here, and what it would take to change.
    """
    t = get_or_create_trust(conn, category)
    half_life  = t.get("decay_half_life") or DEFAULT_DECAY_HALF_LIFE
    team_rate  = _get_team_override_rate(conn)
    threshold  = _compute_threshold(t.get("risk_profile", "medium"), team_rate)
    _, _, score, confidence = _compute_bayesian_score(conn, category, half_life)

    recent_decisions = conn.execute(
        """SELECT manager_response, was_autonomous, timestamp
           FROM decision WHERE category=? ORDER BY timestamp DESC LIMIT 10""",
        (category,),
    ).fetchall()

    recent_events = conn.execute(
        "SELECT * FROM trust_events WHERE category=? ORDER BY timestamp DESC LIMIT 8",
        (category,),
    ).fetchall()

    # Compute per-decision weighted contributions for transparency
    signal_breakdown = []
    for row in recent_decisions:
        days = _days_ago(row["timestamp"])
        tw   = _time_weight(days, half_life)
        key  = "n/a" if (row["manager_response"] == "n/a" and row["was_autonomous"]) else row["manager_response"]
        q    = SIGNAL_QUALITY.get(key, 0.0)
        signal_breakdown.append({
            "timestamp":    row["timestamp"],
            "response":     row["manager_response"],
            "autonomous":   bool(row["was_autonomous"]),
            "days_ago":     round(days, 1),
            "time_weight":  round(tw, 3),
            "signal":       round(q * tw, 3),
        })

    # Path to promotion / explanation of current state
    if t["ceiling"]:
        path_to_auto = "Hard ceiling — always escalates regardless of approval history."
    elif t["trust_level"] == "auto":
        overrides_to_demote = 1
        path_to_auto = (
            f"Currently autonomous. "
            f"One override (within the last ~{half_life} days) will immediately demote to ask."
        )
    else:
        score_gap = threshold - score
        approx_approvals_needed = max(1, round(score_gap * (CONFIDENCE_SATURATION_N + 2)))
        path_to_auto = (
            f"Needs score ≥ {threshold:.2f} (currently {score:.2f}, gap {score_gap:.2f}). "
            f"Approximately {approx_approvals_needed} more consecutive approved decisions needed "
            f"(recent ones count more due to time decay). "
            f"{'Confidence sufficient.' if confidence >= MINIMUM_CONFIDENCE_TO_PROMOTE else f'Confidence {confidence:.2f} still building — need more decisions.'}"
        )

    return {
        "category":          category,
        "trust_level":       t["trust_level"],
        "trust_score":       round(score, 3),
        "trust_confidence":  round(confidence, 3),
        "auto_threshold":    round(threshold, 3),
        "risk_profile":      t.get("risk_profile", "medium"),
        "ceiling":           bool(t["ceiling"]),
        "team_override_rate": round(team_rate, 3),
        "decay_half_life_days": half_life,
        "approvals_count":   t["approvals_count"],
        "overrides_count":   t["overrides_count"],
        "path_to_auto":      path_to_auto,
        "signal_breakdown":  signal_breakdown,
        "recent_events":     [dict(e) for e in recent_events],
        "explanation": (
            f"'{category}' has risk profile '{t.get('risk_profile','medium')}' "
            f"(threshold {threshold:.2f}). "
            f"Current Bayesian score: {score:.2f} (confidence: {confidence:.2f}). "
            f"Team override rate: {team_rate:.1%}. "
            f"Status: {t['trust_level'].upper()}."
        ),
    }
