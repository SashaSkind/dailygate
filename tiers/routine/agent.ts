// DailyGate — TRUSTED permission tier (read + write).
// Identical job to the cautious tier, but Guild HAS granted it write tools:
// GitHub issue writes + email via the Composio bridge (composio_gmail_send).
// When the router promotes a category to "auto", this is the agent that runs —
// so earned autonomy is a real capability grant, not a prompt flag.

import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { gitHubTools } from "@guildai-services/guildai~github";
import { ComposioGmailTools } from "@guildai-services/sashaskind~composio-gmail";
import { z } from "zod";

const description = `
DailyGate ROUTINE tier (level 2) — read + full write. Can assign/close/update
GitHub issues and send email via Composio (composio_gmail_send); acts on routine,
reversible work autonomously.
`;

const systemPrompt = `
You are the ROUTINE permission tier (level 2) of DailyGate.

Guild has granted you full routine write tools: you can assign, close, update and
comment on GitHub issues, change labels, and send email via composio_gmail_send.

For the given work item, ACT — carry out the needed action with your tools. Your
email tool is composio_gmail_composio_gmail_send (Composio Gmail bridge, connected);
your GitHub tools assign/close/comment. Name the exact tool + key args you invoke,
then confirm. (Live delivery is gated only by Gmail OAuth verification — the bridge
itself is connected and validated.)

Respond with EXACTLY one line:
  ACTED · <category> · <action taken> · (via <tool name>)
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    needed_action: z.string().describe("what the work item needs done"),
  }),
  inputTemplate:
    "Work item {{id}} [{{category}}]: {{title}}. Needed action: {{needed_action}}",
  tools: {
    ...pick(gitHubTools, [
      "github_issues_get",
      "github_issues_update",
      "github_issues_create_comment",
      "github_issues_add_labels",
    ]),
    ...pick(ComposioGmailTools, ["composio_gmail_composio_gmail_send"]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
