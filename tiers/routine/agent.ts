// DailyGate — TRUSTED permission tier (read + write).
// Identical job to the cautious tier, but Guild HAS granted it write tools:
// GitHub issue writes + email via the Composio bridge (composio_gmail_send).
// When the router promotes a category to "auto", this is the agent that runs —
// so earned autonomy is a real capability grant, not a prompt flag.

import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { gitHubTools } from "@guildai-services/guildai~github";
import { ComposioGmailTools } from "@guildai-services/daily-gate~composio-gmail";
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

For the given work item, ACT — actually carry out the needed action with your tools.

- EMAIL items: REALLY SEND via composio_gmail_composio_gmail_send. Pass:
    user_id: "dailygate"
    arguments: { recipient_email, subject, body }
  Write a short, warm subject + body for the item. Use the recipient_email given in
  the task. Actually invoke the tool — do not just describe it.
- GITHUB items: ACTUALLY perform the action via your GitHub tools, using the owner,
  repo and issue_number given in the task. Use github_issues_create_comment to post a
  comment, then github_issues_update with state "closed" to close. Really invoke the
  tools — do not just describe them.

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
