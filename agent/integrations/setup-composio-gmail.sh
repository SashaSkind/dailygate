#!/usr/bin/env bash
# Composio→Guild bridge for Gmail. Wraps Composio's tool-execute API as a Guild
# integration so the trusted-tier agent gets a `composio_gmail_send` tool.
#
# Run from agent/. Steps up to `build`/`publish` need only Guild auth.
# `connect` needs the COMPOSIO API KEY (+ a Gmail account connected in Composio).
set -euo pipefail
GUILD="npx -y @guildai/cli@0.12.3"
NAME="sashaskind~composio-gmail"   # integration id must be UUID or owner~name
SPEC="integrations/composio-gmail.openapi.yaml"

# 1. Create the integration (api-key auth → Composio's x-api-key header)
$GUILD integration create composio-gmail \
  --description "Send Gmail via Composio's tool-execute API" \
  --base-url "https://backend.composio.dev/api/v3" \
  --auth-scheme api-key \
  --header-template "x-api-key: {token}"

# 2. New draft version (copy the printed Version ID into VID)
$GUILD integration version create "$NAME"
VID="<paste-version-id>"

# 3. Add the Gmail-send operation from the OpenAPI spec (async; poll with operation list)
$GUILD integration operation create "$NAME" "$VID" --openapi "$SPEC"
$GUILD integration operation list "$NAME"

# 4. Build + validate, then publish
$GUILD integration version build   "$NAME" --version-number 1.0.0
$GUILD integration version publish "$NAME" --version-number 1.0.0

# 5. Connect credentials — NEEDS COMPOSIO API KEY (interactive/secret)
#    $GUILD integration connect "$NAME"
echo "Published. Run 'guild integration connect $NAME' with the Composio API key to finish."
