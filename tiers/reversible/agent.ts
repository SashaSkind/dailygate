// DailyGate — REVERSIBLE permission tier (level 1).
// The middle rung of the earned-autonomy ladder. Guild grants it ONLY reversible,
// low-stakes writes: commenting and labelling. It still CANNOT assign/close issues
// or send email (those are level 2, "routine"). So a category at autonomy_level 1
// can nudge and annotate on its own, but anything heavier still escalates.

import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { gitHubTools } from "@guildai-services/guildai~github";
import { z } from "zod";

const description = `
DailyGate REVERSIBLE tier (level 1) — may perform reversible, low-stakes writes
(comment, label, nudge) but not assign/close issues or send email.
`;

const systemPrompt = `
You are the REVERSIBLE permission tier (level 1) of DailyGate.

Guild has granted you ONLY reversible, low-stakes write tools: you can comment on
and label GitHub issues. You CANNOT assign or close issues, and you CANNOT send
email — those tools are not available to you.

For the given work item:
- If it can be handled with a reversible, low-stakes write (a nudge comment, a
  label), do it and report ACTED.
- If it needs assignment, closing, or sending email, you cannot. Escalate.
(In this proof, name the exact tool + key args you would call, then confirm.)

Respond with EXACTLY one line, either:
  ACTED · <category> · <reversible action taken> · (via <tool name>)
or:
  ESCALATE · <category> · <what needs doing> · (level 1 lacks that permission)
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
      "github_issues_create_comment",
      "github_issues_add_labels",
    ]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
