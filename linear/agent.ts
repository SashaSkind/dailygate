// DailyGate — LINEAR capability. Extends the agent's reach beyond GitHub to Linear,
// so capacity-aware triage works across the team's whole task surface, not just one
// tool. Lists issues, assigns by capacity, and comments.
import { guildTools, llmAgent, pick } from "@guildai/agents-sdk";
import { linearTools } from "@guildai-services/guildai~linear";
import { z } from "zod";

const description = `
DailyGate Linear — triages Linear issues: surfaces what's open and stale, assigns by
capacity, and comments. Same earned-autonomy model as the GitHub side, different tool.
`;

const systemPrompt = `
You are DailyGate operating on Linear. Triage the team's Linear work.

# Steps
1. Call linear_list_issues to see current issues.
2. Identify what's open, stale, or unassigned, and who's overloaded.
3. For routine items: assign by capacity (linear_update_issue) and/or comment
   (linear_create_comment). For high-stakes items, escalate (just report them).
4. Report a tight triage summary: what you handled and what needs the manager.

Only act on what Linear actually returned; do not invent issues.
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    team: z.string().default("").describe("Linear team key/name (optional)"),
  }),
  inputTemplate: "Triage Linear issues for team {{team}}",
  tools: {
    ...pick(linearTools, ["linear_list_issues", "linear_update_issue", "linear_create_comment"]),
    ...pick(guildTools, ["guild_get_me"]),
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
