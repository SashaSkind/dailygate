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
import { randomUUID } from "node:crypto";

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

// Trust comes from Person B's live API; fall back to the frozen fixture if it's down.
const API_BASE = process.env.API_BASE || "http://localhost:8001";
async function loadTrust() {
  try {
    const r = await fetch(`${API_BASE}/context`);
    if (r.ok) {
      const d = await r.json();
      console.log(`  (trust ← ${API_BASE}/context)`);
      return d.trust;
    }
  } catch { /* fall through */ }
  console.log(`  (trust ← local fixture; ${API_BASE} unreachable)`);
  return JSON.parse(readFileSync(resolve(ROOT, "contract/fake_context.json"), "utf8")).trust;
}
const trust = await loadTrust();

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
const out = res.stdout || "";
process.stdout.write(out);
if (res.stderr) process.stderr.write(res.stderr);

// ── WRITE-BACK: record the outcome so the feed + trust update live ──────────────
// ACTED  → autonomous decision (manager_response="n/a")  → shows in /feeds/autonomy
// ESCALATE → pending decision (manager_response="pending")→ shows in /feeds/escalations
await recordDecision(out);

async function recordDecision(agentOutput) {
  const m = agentOutput.match(/(ACTED|ESCALATE)\b[^\n]*/);
  if (!m) { console.log("\n✎ no ACTED/ESCALATE line parsed — skipping write-back"); return; }
  const wasAutonomous = m[1] === "ACTED";
  const decision = {
    id: `router-${itemId}-${randomUUID().slice(0, 8)}`,
    item_id: itemId,
    category: item.category,
    action: m[0].trim().slice(0, 240),
    stakes: (t.ceiling || t.risk_profile === "high") ? "high" : "low",
    reversible: !t.ceiling,
    was_autonomous: wasAutonomous,
    manager_response: wasAutonomous ? "n/a" : "pending",
  };
  try {
    const r = await fetch(`${API_BASE}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decision),
    });
    if (!r.ok) { console.log(`\n✎ write-back failed (${r.status})`); return; }
    const { trust } = await r.json();
    console.log(`\n✎ recorded ${wasAutonomous ? "AUTONOMOUS action" : "ESCALATION (pending)"} → POST /decision`);
    console.log(`  trust[${item.category}] → level ${trust.autonomy_level}, score ${trust.trust_score}` +
      (wasAutonomous ? `, approvals ${trust.approvals_count}` : `, awaiting manager`));
  } catch {
    console.log(`\n✎ write-back skipped — ${API_BASE} unreachable`);
  }
}
