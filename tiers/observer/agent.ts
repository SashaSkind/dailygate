// DailyGate — CAUTIOUS permission tier (read-only).
// Same job as the trusted tier, but Guild grants it NO write/send tools. It can
// only inspect; anything requiring a write must be escalated. The capability gap
// vs. the trusted tier is the whole point — it's governed by Guild, not the prompt.

import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { gitHubTools } from "@guildai-services/guildai~github";
import { z } from "zod";

const description = `
DailyGate OBSERVER tier (level 0) — read-only. Inspects a work item but cannot
write or send anything; escalates any item that needs a write action.
`;

const systemPrompt = `
You are the OBSERVER permission tier (level 0) of DailyGate.

Your tools are READ-ONLY. You can read GitHub issues. You have NO ability to
update issues, post comments, change labels, or send email — those tools are
simply not available to you (Guild has not granted them).

For the given work item:
- If it can be handled by reading alone, do so and summarize briefly.
- If it requires ANY write or send action, you cannot perform it. Escalate.

Respond with EXACTLY one line:
  ESCALATE · <category> · <what needs doing> · (level 0 observer lacks write permission)
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
      "github_issues_list_for_repo",
      "github_issues_list_comments_for_repo",
    ]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
