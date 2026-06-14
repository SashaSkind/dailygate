#!/usr/bin/env bash
# Reset for a clean on-camera take: fresh DB + 3 fresh GitHub issues, then prints
# the 3 commands to run. Usage:  bash tiers/demo-reset.sh
set -euo pipefail
REPO="SashaSkind/dailygate"
cd "$(dirname "$0")/.."

# fresh trust state (API reseeds on next boot; restart it after this if running)
rm -f data/api/dailygate.db* 2>/dev/null || true
gh label create needs-review -R "$REPO" --color FBCA04 -d "Flagged by DailyGate" 2>/dev/null || true

A=$(gh issue create -R "$REPO" -t "Fix typo in onboarding docs" -b "Setup guide says 'recieve'. Minor doc fix." | grep -oE '[0-9]+$')
B=$(gh issue create -R "$REPO" -t "Add input validation to /context endpoint" -b "Validate query params before the DB. Quick review." | grep -oE '[0-9]+$')
C=$(gh issue create -R "$REPO" -t "Decide: hire or pass on candidate Jordan (eng)" -b "Final call on the eng candidate." | grep -oE '[0-9]+$')

cat <<EOF

✅ Fresh issues created. Restart the API (data/api) so trust is clean, then run these ON CAMERA:

  node tiers/demo-live.mjs $A issue-triage        # HIGH trust  → ROUTINE   → comments + CLOSES (task done ✅)
  node tiers/demo-live.mjs $B code-review         # MED trust   → REVERSIBLE → comments + flags needs-review (stays open)
  node tiers/demo-live.mjs $C candidate-decision  # CEILING     → ESCALATES  → lands in the approval queue (you click Approve in the UI)

Between runs, cut to:  the GitHub issue page  +  the dashboard (autonomy feed grows, trust score ticks up).
EOF
