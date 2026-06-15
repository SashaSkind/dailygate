// DailyGate — ROUTER agent. The single installable entry point. It reads how much
// autonomy a work item's CATEGORY has earned and delegates to the matching
// permission tier — each tier a separate Guild agent with a different tool grant.
// Promotion to a higher tier literally hands the work to an agent Guild has granted
// more tools. That's earned autonomy as real permissions, not a prompt flag.
//
// The 3 tiers are this agent's dependencies (their auto-generated /tool packages),
// so installing the router installs the whole ladder — one install for the user.

import { llmAgent } from "@guildai/agents-sdk";
import { z } from "zod";
import observerTool from "@guildai/daily-gate~dailygate-observer/tool";    // L0 read-only
import reversibleTool from "@guildai/daily-gate~dailygate-reversible/tool"; // L1 comment/label
import routineTool from "@guildai/daily-gate~dailygate-routine/tool";       // L2 assign/close/email

const description = `
DailyGate router — the entry point for the earned-autonomy agent. Given a work item,
it classifies the category, looks up the autonomy it has earned, and delegates to the
right permission tier (observer / reversible / routine). High-stakes/irreversible
categories are capped and always escalate.
`;

const systemPrompt = `
You are the DailyGate ROUTER. You receive ONE work item and route it to the correct
permission tier based on how much autonomy that work's CATEGORY has earned.

# Steps
1. Classify the work item into a CATEGORY (e.g. issue-triage, capacity-assignment,
   nudge, thank-you-note, code-review, candidate-decision).
2. Look up the earned AUTONOMY LEVEL from the TRUST TABLE below.
3. CEILING categories (candidate-decision, or anything hiring/firing/irreversible or
   touching money/a person's standing) are CAPPED at level 0, no matter the score.
4. DELEGATE by calling exactly ONE tier tool with { id, title, category, needed_action }:
   - level 0 → call "observer"   (read-only; it will escalate)
   - level 1 → call "reversible"  (comment / label / nudge)
   - level 2 → call "routine"     (assign / close / send email)
5. Report: the category, the earned level, which tier you routed to, and what it did.

# TRUST TABLE (earned autonomy per category — in production this comes from the
# Bayesian trust engine; embedded here)
issue-triage = 2 · capacity-assignment = 2 · thank-you-note = 2
nudge = 1 · code-review = 1
candidate-decision = 0 (CEILING)
Unknown category → level 0.

Call only ONE tier tool. Do not invent results — report what the tier returns.
`;

export default llmAgent({
  description,
  inputSchema: z.object({
    id: z.string(),
    title: z.string(),
    needed_action: z.string().describe("what the work item needs done"),
  }),
  inputTemplate: "Work item {{id}}: {{title}}. Needed action: {{needed_action}}",
  tools: {
    observer: observerTool,
    reversible: reversibleTool,
    routine: routineTool,
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
