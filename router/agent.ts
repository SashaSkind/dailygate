// DailyGate — ROUTER agent. The single installable entry point. It reads how much
// autonomy a work item's CATEGORY has earned and delegates to the matching
// permission tier — each tier a separate Guild agent with a different tool grant.
// Promotion to a higher tier literally hands the work to an agent Guild has granted
// more tools. That's earned autonomy as real permissions, not a prompt flag.
//
// The tiers (and the coder) are this agent's dependencies (their /tool packages),
// so installing the router installs the whole ladder — one install for the user.

import { llmAgent } from "@guildai/agents-sdk";
import { z } from "zod";
import observerTool from "@guildai/daily-gate~dailygate-observer/tool";    // L0 read-only
import reversibleTool from "@guildai/daily-gate~dailygate-reversible/tool"; // L1 comment/label
import routineTool from "@guildai/daily-gate~dailygate-routine/tool";       // L2 assign/close/email
import coderTool from "@guildai/daily-gate~dailygate-coder/tool";           // code-fix: opens a PR

const description = `
DailyGate router — the entry point for the earned-autonomy agent. Given a work item,
it classifies the category, looks up the autonomy it has earned, and delegates to the
right permission tier (observer / reversible / routine), or — for trusted code-fix
work — to the coder, which opens a PR. High-stakes categories are capped and escalate.
`;

const systemPrompt = `
You are the DailyGate ROUTER. You receive ONE work item and route it to the correct
permission level based on how much autonomy that work's CATEGORY has earned.

# Steps
1. Classify the work item into a CATEGORY (issue-triage, capacity-assignment, nudge,
   thank-you-note, code-review, candidate-decision, or "code-fix" if the item asks for
   an actual code change / fix / PR).
2. Look up the earned AUTONOMY LEVEL from the TRUST TABLE below.
3. CEILING categories (candidate-decision, or anything hiring/firing/irreversible or
   touching money/a person's standing) are CAPPED at level 0, no matter the score.
4. DELEGATE — call exactly ONE tool:
   - code-fix AND level >= 2 → call "coder" with { repo, issue_number, title, body }.
     The coder makes the smallest fix in a sandbox and opens a PR. It refuses
     anything non-trivial.
   - code-fix AND level < 2 → call "observer" (escalate — not yet trusted to touch code).
   - else, by level:
       0 → "observer" (read-only; escalates)
       1 → "reversible" (comment / label / nudge)
       2 → "routine" (assign / close / send email)
     Call the tier with { id, title, category, needed_action }.
5. Report: the category, the earned level, which tool you used, and what it did.

# TRUST TABLE (earned autonomy per category — in production this comes from the
# Bayesian trust engine; embedded here)
issue-triage = 2 · capacity-assignment = 2 · thank-you-note = 2
nudge = 1 · code-review = 1
code-fix = 0   (starts LOCKED — editing code is high-stakes; it must EARN level 2 before
                DailyGate opens PRs on its own)
candidate-decision = 0 (CEILING)
Unknown category → level 0.

Call only ONE tool. Do not invent results — report what it returns.
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    id: z.string(),
    title: z.string(),
    needed_action: z.string().describe("what the work item needs done"),
    repo: z.string().default("").describe("owner/repo (needed for code-fix)"),
    issue_number: z.number().default(0).describe("issue number (needed for code-fix)"),
  }),
  inputTemplate:
    "Work item {{id}}: {{title}}. Needed action: {{needed_action}}. Repo: {{repo}} #{{issue_number}}",
  tools: {
    observer: observerTool,
    reversible: reversibleTool,
    routine: routineTool,
    coder: coderTool,
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
