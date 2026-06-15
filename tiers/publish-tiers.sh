#!/usr/bin/env bash
# Publish the 3 permission-tier agents so the router can delegate to them.
# Each tier is a SEPARATE Guild agent with a DIFFERENT tool grant — that's what
# makes earned autonomy real (Guild-governed permissions), not a prompt flag.
#
#   observer   (L0) — read-only            → can only escalate
#   reversible (L1) — comment / label      → reversible low-stakes writes
#   routine    (L2) — assign/close/email   → routine work (GitHub + Composio Gmail)
#
# The local tier dirs lost their Guild git link (repo de-nesting), so we publish
# each via a fresh Guild clone + our source. Run from repo root.
set -euo pipefail
WS="sashaskind/daily-gate"
# function (not a var) — zsh does NOT word-split unquoted vars like bash does.
GCLI() { npx -y @guildai/cli@0.12.3 "$@"; }

publish_tier() {
  local tier=$1 name=$2
  rm -rf "/tmp/pub-$tier"
  GCLI agent clone "sashaskind~$name" --directory "/tmp/pub-$tier"   # clone includes guild.json
  cp "tiers/$tier/agent.ts" "tiers/$tier/package.json" "/tmp/pub-$tier/"
  ( cd "/tmp/pub-$tier" && GCLI agent save --all -m "publish tier $name" --publish )
  GCLI workspace agent add "sashaskind~$name" --workspace "$WS"
}

publish_tier observer   dailygate-cautious      # L0
publish_tier reversible dailygate-reversible    # L1
publish_tier routine    dailygate-trusted       # L2

echo "Published: dailygate-cautious (L0) · dailygate-reversible (L1) · dailygate-trusted (L2)"
echo "The router imports each tier's auto-generated /tool subpackage to delegate."
