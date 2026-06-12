#!/usr/bin/env bash
# DailyGate — wake the agent on real-time events (the Autonomy criterion).
# YOU run this: creating an auto-firing agent loop is a human decision, and the
# GitHub connect is a browser OAuth step only you can do.
#
# Prereqs already done (migrated to the shared ORG so your teammate inherits them):
#   ✓ org agent published: daily-gate~dailygate-agent (trigger-ready, non-interactive)
#   ✓ added to org workspace: daily-gate/team
set -euo pipefail
GUILD="npx -y @guildai/cli@0.12.3"
WS="daily-gate/team"                       # org workspace (shared with teammate)
AGENT="daily-gate~dailygate-agent"         # org-owned agent

# ── 1. Connect GitHub via the DASHBOARD, in the ORG context (OAuth can't be done by
#       the CLI). In a browser:
#         app.guild.ai → org "daily-gate" → Integrations → GitHub → Connect
#       Authorize Guild's GitHub app and grant access to SashaSkind/dailygate.
#       (Connecting under the ORG means your teammate shares the credential.)
#   (CLI attempt returns: "OAuth integrations must be connected via the dashboard.")

# ── 2. THE DEMO TRIGGER: a fresh GitHub issue wakes the agent unprompted ────────
#     Open an issue in the repo → trigger fires → agent triages it within seconds.
#     (github-oauth is the integration with webhooks enabled; if it errors, try
#      --integration github.)
$GUILD trigger create \
  --workspace "$WS" \
  --type webhook --integration github-oauth \
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
