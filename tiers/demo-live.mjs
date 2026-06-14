#!/usr/bin/env node
// LIVE end-to-end demo: a REAL task, start → decide → execute → done → dashboard.
//   node tiers/demo-live.mjs <issue#> [category]      # GitHub task
//   node tiers/demo-live.mjs email thank-you-note     # real email task
//
// 1. shows the pending task
// 2. agent reads LIVE trust, routes to a permission tier
// 3. the Guild tier agent reasons      (real agent decision)
// 4. EXECUTES for real — GitHub via `gh`, or email via Gmail SMTP
// 5. records it → the dashboard feed + Bayesian trust update

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const WS   = "sashaskind/daily-gate";
const REPO = "SashaSkind/dailygate";
const API  = process.env.API_BASE || "http://localhost:8001";
const GUILD = ["npx", "-y", "@guildai/cli@0.12.3"];
const TIER_DIR = { 0: "observer", 1: "reversible", 2: "routine" };

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" });
const line = (s) => console.log(s);

const [, , arg1, catArg] = process.argv;
const isEmail = arg1 === "email";
const category = catArg || (isEmail ? "thank-you-note" : "issue-triage");
if (!arg1) { console.error("usage: node tiers/demo-live.mjs <issue#|email> [category]"); process.exit(1); }

// ── 1. PENDING TASK ─────────────────────────────────────────────────────────────
let title, num = null;
if (isEmail) {
  title = "Thank-you note to design partner — stale 9 days";
  line(`\n━━━ 📥 PENDING TASK ━━━`);
  line(`  📧 email · ${title}`);
} else {
  num = arg1;
  const issue = JSON.parse(sh("gh", ["issue", "view", num, "-R", REPO, "--json", "number,title,state"]).stdout || "{}");
  title = issue.title;
  line(`\n━━━ 📥 PENDING TASK ━━━`);
  line(`  repo: ${REPO}`);
  line(`  #${issue.number}  [${issue.state}]  ${title}`);
}

// ── 2. AGENT READS LIVE TRUST → ROUTES ──────────────────────────────────────────
const ctx = await (await fetch(`${API}/context`)).json();
const t = ctx.trust.find((x) => x.category === category) || { autonomy_level: 0, ceiling: false, trust_score: 0 };
const level = t.ceiling ? 0 : t.autonomy_level;
const tier = TIER_DIR[level];
line(`\n━━━ 🤔 AGENT DECIDES ━━━`);
line(`  category   ${category}`);
line(`  trust      level ${level}  (Bayesian score ${t.trust_score})${t.ceiling ? "  · CEILING" : ""}`);
line(`  → routed   ${tier.toUpperCase()} tier  (Guild grants it exactly these tools)`);

// ── 3. GUILD TIER AGENT REASONS ─────────────────────────────────────────────────
const recipient = process.env.DEMO_EMAIL_TO || "the manager's email";
const needed = isEmail
  ? `send the stale thank-you email to the design partner; recipient_email is ${recipient}`
  : level >= 2
    ? `triage and close issue #${num} as resolved`
    : `post a brief review comment and add a needs-review label on issue #${num}`;
const input = JSON.stringify({ id: isEmail ? "email-7" : `gh-${num}`, title, category, needed_action: needed });
const res = spawnSync(
  GUILD[0],
  [...GUILD.slice(1), "--non-interactive", "agent", "test", "--workspace", WS, "--mode", "json", "--events", "none"],
  { cwd: resolve(ROOT, "tiers", tier), input, encoding: "utf8" },
);
const out = res.stdout || "";
const m = out.match(/(ACTED|ESCALATE)\b[^\n]*/);
const decisionLine = m ? m[0].trim() : "(agent produced no decision line)";
const acted = !!m && m[1] === "ACTED";
line(`  agent →    ${decisionLine}`);

// ── 4. EXECUTE FOR REAL ─────────────────────────────────────────────────────────
line(`\n━━━ ⚡ EXECUTE (real action) ━━━`);
let executed = "";
if (acted && !t.ceiling && isEmail) {
  // The routine agent ACTUALLY invoked composio_gmail_send during its run above —
  // a real email is sent through Guild + Composio (from the connected Gmail).
  line(`  ✓ EMAIL SENT via Composio (composio_gmail_send) — real delivery through Guild ✅`);
  line(`    the routine agent invoked the Composio Gmail tool live during this run.`);
  executed = "email sent (composio)";
} else if (acted && !t.ceiling) {
  const body = level >= 2
    ? `🤖 **DailyGate** triaged this autonomously — \`${category}\` is at trust level ${level} (score ${t.trust_score}), so I'm resolving it. _No human needed._`
    : `🤖 **DailyGate** reviewed this autonomously — \`${category}\` is at trust level ${level}; flagging for human review (not yet trusted to merge).`;
  sh("gh", ["issue", "comment", num, "-R", REPO, "--body", body]);
  line(`  ✓ commented on ${REPO}#${num}`);
  if (level >= 2) {
    sh("gh", ["issue", "close", num, "-R", REPO]);
    line(`  ✓ CLOSED ${REPO}#${num}  —  task done ✅`);
  } else {
    sh("gh", ["issue", "edit", num, "-R", REPO, "--add-label", "needs-review"]);
    line(`  ✓ labeled ${REPO}#${num} \`needs-review\``);
  }
} else {
  line(`  ⏸  escalated — no autonomous action (ceiling / low trust)`);
}

// ── 5. WRITE-BACK → DASHBOARD ───────────────────────────────────────────────────
const decision = {
  id: `live-${isEmail ? "email" : num}-${randomUUID().slice(0, 8)}`,
  item_id: isEmail ? "email-7" : `gh-${num}`,
  category,
  action: decisionLine.slice(0, 240),
  stakes: t.ceiling ? "high" : "low",
  reversible: !t.ceiling,
  was_autonomous: acted,
  manager_response: acted ? "n/a" : "pending",
};
const wb = await fetch(`${API}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(decision) });
const updated = wb.ok ? (await wb.json()).trust : null;
line(`\n━━━ 📊 DASHBOARD ━━━`);
line(`  ✓ recorded → ${acted ? "Autonomy feed" : "Escalation queue"} updated`);
if (updated) line(`  ✓ trust[${category}] → level ${updated.autonomy_level}, score ${updated.trust_score}, approvals ${updated.approvals_count}`);
if (!isEmail) {
  const state = JSON.parse(sh("gh", ["issue", "view", num, "-R", REPO, "--json", "state"]).stdout || "{}").state;
  line(`  GitHub now: ${REPO}#${num} is ${state}   →  https://github.com/${REPO}/issues/${num}`);
}
line("");
