#!/usr/bin/env bash
# DailyGate onboarding — install the agents into YOUR workspace + wire the trigger.
# The OAuth integration connects (GitHub/Slack/Gmail) happen in the browser first;
# see ONBOARDING.md step 2.
#
#   ./onboard.sh <workspace> <owner/repo>
#   e.g. ./onboard.sh daily-gate/team SashaSkind/dailygate
set -euo pipefail
WS="${1:-}"; REPO="${2:-}"
if [[ -z "$WS" || -z "$REPO" ]]; then
  echo "usage: ./onboard.sh <workspace> <owner/repo>"; exit 1
fi
GCLI() { npx -y @guildai/cli@0.12.3 "$@"; }   # function, not a var (zsh-safe)

echo "▶ Checking Guild auth..."
GCLI auth status

echo "▶ Installing DailyGate agents into $WS..."
GCLI workspace agent add daily-gate~dailygate-agent  --workspace "$WS"   # trigger handler
GCLI workspace agent add daily-gate~dailygate-router --workspace "$WS"   # earned-autonomy router

echo "▶ Creating the GitHub issues.opened trigger on $REPO..."
GCLI trigger create \
  --workspace "$WS" \
  --type webhook --integration github \
  --event issues --action opened \
  --agent daily-gate~dailygate-agent \
  --service-config "{\"repository\":\"$REPO\"}"

cat <<EOF

✅ DailyGate is set up for $WS on $REPO.

Next:
  1. If you haven't: connect GitHub/Slack/Gmail in app.guild.ai (ONBOARDING.md step 2).
  2. Start the dashboard:  cd data/api && python -m uvicorn main:app --port 8001
                           cd ui && npm run dev
  3. Open an issue in $REPO and watch it triage + act.
EOF
