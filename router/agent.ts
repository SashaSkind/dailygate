// DailyGate — ROUTER agent. The single installable entry point. It reads how much
// autonomy a work item's CATEGORY has earned — LIVE from the Bayesian trust engine
// (the dailygate_trust_get_context tool) — and delegates to the matching permission
// tier. Promotion to a higher tier literally hands the work to an agent Guild has
// granted more tools. Earned autonomy as real permissions, driven by a real model.

import { llmAgent, pick } from "@guildai/agents-sdk";
import { z } from "zod";
import observerTool from "@guildai/daily-gate~dailygate-observer/tool";    // L0 read-only
import reversibleTool from "@guildai/daily-gate~dailygate-reversible/tool"; // L1 comment/label
import routineTool from "@guildai/daily-gate~dailygate-routine/tool";       // L2 assign/close/email
import coderTool from "@guildai/daily-gate~dailygate-coder/tool";           // code-fix: opens a PR
import { DailygateTrustTools } from "@guildai-services/daily-gate~dailygate-trust"; // live Bayesian trust

const description = `
DailyGate router — the entry point for the earned-autonomy agent. It reads the live
Bayesian trust level for the work's category and delegates to the right permission
tier (observer / reversible / routine), or — for trusted code-fix work — to the coder,
which opens a PR. High-stakes categories are capped and escalate.
`;

const systemPrompt = `
You are the DailyGate ROUTER. You receive ONE work item and route it to the correct
permission level based on how much autonomy that work's CATEGORY has EARNED.

# Steps
1. Classify the work item into a CATEGORY (issue-triage, capacity-assignment, nudge,
   thank-you-note, code-review, candidate-decision, or "code-fix" if the item asks for
   an actual code change / fix / PR).
2. Call **dailygate_trust_get_context** to read the LIVE Bayesian trust. Find the row
   whose category matches; use its "autonomy_level" (0/1/2) and "ceiling". This is the
   real, learned trust — ALWAYS use it. (Only if the call fails, fall back to the
   table at the bottom.)
3. CEILING categories (ceiling=true, e.g. candidate-decision, or anything hiring/
   firing/irreversible) are CAPPED at level 0, no matter the score.
4. DELEGATE — call exactly ONE delegation tool:
   - code-fix AND level >= 2 → call "coder" with { repo, issue_number, title, body }.
   - code-fix AND level < 2 → call "observer" (escalate — not yet trusted to touch code).
   - else, by level: 0 → "observer", 1 → "reversible", 2 → "routine"
     (call the tier with { id, title, category, needed_action }).
5. Report: the category, the LIVE level you read (and that you read it from the trust
   engine), which tool you used, and what it did.

# FALLBACK TABLE (only if the trust call fails)
issue-triage=2 · capacity-assignment=2 · thank-you-note=2 · nudge=1 · code-review=1
code-fix=0 · candidate-decision=0(ceiling) · unknown=0

Call exactly one delegation tool. Do not invent results — report what it returns.
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
    ...pick(DailygateTrustTools, ["dailygate_trust_get_context"]),
    observer: observerTool,
    reversible: reversibleTool,
    routine: routineTool,
    coder: coderTool,
  },
  systemPrompt,
  mode: "one-shot",
  useWorkspaceAgents: false,
});
