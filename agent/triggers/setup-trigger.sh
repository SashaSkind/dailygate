#!/usr/bin/env bash
# DailyGate — wake the agent on real-time events (the Autonomy criterion).
# YOU run this: creating an auto-firing agent loop is a human decision, and the
# GitHub connect is a browser OAuth step only you can do.
#
# Prereqs already done:
#   ✓ agent published: sashaskind~dailygate-agent (v1.0.1, trigger-ready, non-interactive)
set -euo pipefail
GUILD="npx -y @guildai/cli@0.12.3"
WS="sashaskind/daily-gate"
AGENT="sashaskind~dailygate-agent"

# ── 1. Connect GitHub (browser OAuth) — needed for the webhook + for the agent to act
#     Opens a browser; authorize the repo(s) you want DailyGate to watch.
$GUILD integration connect guildai~github-oauth --owner sashaskind

# ── 2. THE DEMO TRIGGER: a fresh GitHub issue wakes the agent unprompted ────────
#     Open an issue in the repo → trigger fires → agent triages it within seconds.
$GUILD trigger create \
  --workspace "$WS" \
  --type webhook --integration github \
  --event issues --action opened \
  --agent "$AGENT" \
  --service-config '{"repository":"SashaSkind/dailygate"}'

# ── 3. Verify + watch it fire ───────────────────────────────────────────────────
#     $GUILD trigger list --workspace "$WS"
#     # open a GitHub issue, then:
#     $GUILD trigger sessions <trigger-id>      # shows the autonomous session it spawned

# ── (OPTIONAL) Mechanism smoke-test WITHOUT GitHub — a time trigger ─────────────
#     Use a SANE cadence and DEACTIVATE right after; do NOT leave an every-minute
#     autonomous loop running.
#   $GUILD trigger create --workspace "$WS" --type time --frequency DAILY --time 09:00 \
#     --agent "$AGENT" \
#     --input '{"prompt":"Run your daily autonomous review; act on routine items, escalate high-stakes ones."}'
#   $GUILD trigger deactivate <trigger-id>
