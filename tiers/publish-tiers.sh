#!/usr/bin/env bash
# Publish / update the org-owned earned-autonomy ladder.
#
#   daily-gate~dailygate-router            ← the ONE agent a user installs
#     ├─ daily-gate~dailygate-observer     L0 read-only        (escalates)
#     ├─ daily-gate~dailygate-reversible   L1 comment/label
#     └─ daily-gate~dailygate-routine      L2 assign/close + Composio email (org integration)
#
# Each tier is a SEPARATE Guild agent with a DIFFERENT tool grant — that's what makes
# earned autonomy real (Guild-governed permissions), not a prompt flag. All org-owned
# so they run in the org workspace on the org's own connected credentials.
#
# This updates EXISTING org agents from local source. (First-time creation was via
# `guild agent fork ... --owner daily-gate`.) Run from repo root.
set -euo pipefail
WS="daily-gate/team"
GCLI() { npx -y @guildai/cli@0.12.3 "$@"; }   # function, not a var — zsh won't word-split a var

# Clone the Guild-linked copy, drop in the latest agent.ts, publish, add to workspace.
# (Each agent's package.json — org name + deps — is maintained in the published agent.)
publish_agent() {
  local name=$1 srcdir=$2
  rm -rf "/tmp/pub-$name"
  GCLI agent clone "daily-gate~$name" --directory "/tmp/pub-$name"
  cp "$srcdir/agent.ts" "/tmp/pub-$name/agent.ts"
  ( cd "/tmp/pub-$name" && GCLI agent save --all -m "publish $name" --publish )
  GCLI workspace agent add "daily-gate~$name" --workspace "$WS"
}

publish_agent dailygate-observer   tiers/observer
publish_agent dailygate-reversible tiers/reversible
publish_agent dailygate-routine    tiers/routine
publish_agent dailygate-router     router

echo "Published org ladder under $WS."
