#!/usr/bin/env node
// DailyGate tier router (proof). Reads the graded autonomy_level from the frozen
// fixture, maps it to a permission tier, and invokes that Guild agent. This is
// the "earned autonomy" switch: higher autonomy_level → an agent Guild has granted
// more tools. The ceiling CAPS a category at level 0 no matter how high it climbs.
//
//   node tiers/router.mjs <email-7|email-3|gh-412|gh-389|gh-377> [--level 0|1|2]
//
// In production the router reads autonomy_level from ClickHouse (Person B's Bayesian
// pipeline). --level is demo-only, to force the switch on camera.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const WS = "sashaskind/daily-gate";
const GUILD = ["npx", "-y", "@guildai/cli@0.12.3"];

const TIER_DIR = { 0: "observer", 1: "reversible", 2: "routine" };
const TIER_LABEL = {
  0: "OBSERVER  (read-only)",
  1: "REVERSIBLE (comment / label / nudge)",
  2: "ROUTINE   (assign / close / send email)",
};

const ITEMS = {
  "email-7": { title: "Thank-you note to design partner", category: "thank-you-note", needed_action: "send the thank-you email to the design partner" },
  "email-3": { title: "Candidate decision — Jordan (eng hire)", category: "candidate-decision", needed_action: "send the candidate decision email" },
  "gh-412":  { title: "Fix login race condition", category: "issue-triage", needed_action: "close as a duplicate of gh-389 and assign owner" },
  "gh-389":  { title: "Login intermittently fails under load", category: "nudge", needed_action: "post a nudge comment — stale for 14 days" },
  "gh-377":  { title: "Refactor auth middleware", category: "code-review", needed_action: "label needs-review and request a reviewer" },
};

const trust = JSON.parse(readFileSync(resolve(ROOT, "contract/fake_context.json"), "utf8")).trust;

const [, , itemId, ...rest] = process.argv;
if (!itemId || !ITEMS[itemId]) {
  console.error(`usage: node router.mjs <${Object.keys(ITEMS).join("|")}> [--level 0|1|2]`);
  process.exit(1);
}
const item = ITEMS[itemId];
const ovIdx = rest.indexOf("--level");
const override = ovIdx >= 0 ? Number(rest[ovIdx + 1]) : null;

const t = trust.find((x) => x.category === item.category) || { autonomy_level: 0, ceiling: false, trust_score: 0 };

// routing decision: ceiling caps at 0; otherwise use earned (or overridden) level
let level, why;
const earned = override !== null ? override : t.autonomy_level;
if (t.ceiling) {
  level = 0;
  why = `category '${item.category}' is a hard ceiling → CAPPED at level 0 (earned ${earned} ignored)`;
} else {
  level = earned;
  why = `autonomy_level=${level}${override !== null ? " (forced)" : ` (earned; trust_score ${t.trust_score})`}`;
}
const tier = TIER_DIR[level];

console.log(`\n▶ ROUTER`);
console.log(`  item      ${itemId} — ${item.title}`);
console.log(`  category  ${item.category}${t.ceiling ? "  (ceiling)" : ""}`);
console.log(`  → level   ${level}  ${TIER_LABEL[level]}`);
console.log(`  reason    ${why}\n`);

const input = JSON.stringify({ id: itemId, title: item.title, category: item.category, needed_action: item.needed_action });
const res = spawnSync(
  GUILD[0],
  [...GUILD.slice(1), "--non-interactive", "agent", "test", "--workspace", WS, "--mode", "json", "--events", "none"],
  { cwd: resolve(ROOT, "tiers", tier), input, encoding: "utf8" },
);
process.stdout.write(res.stdout || "");
if (res.stderr) process.stderr.write(res.stderr);
