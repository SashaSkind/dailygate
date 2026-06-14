#!/usr/bin/env node
// DailyGate — Live Demo Control panel. Big buttons that run the REAL end-to-end
// (Guild agent decides → real GitHub action → dashboard updates) on click.
//   node tiers/demo-server.mjs   →   open http://localhost:7799
// Self-contained (Node built-ins only). Separate from the main dashboard so it
// never conflicts with the React app.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const REPO = "SashaSkind/dailygate";
const PORT = 7799;

function run(cmd, args) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", () => res(out));
  });
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>DailyGate — Live Demo</title>
<style>
  body{font:15px/1.5 -apple-system,system-ui,sans-serif;background:#f5f7fa;color:#0d1117;max-width:900px;margin:0 auto;padding:32px}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#718096;margin-bottom:24px}
  .row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}
  button{font:600 15px sans-serif;padding:14px 20px;border-radius:10px;border:1px solid;cursor:pointer;flex:1;min-width:200px}
  .b-reset{background:#eef2ff;border-color:#c7d2fe;color:#3730a3}
  .b1{background:#f0fdf4;border-color:#bbf7d0;color:#16a34a}
  .b2{background:#eff6ff;border-color:#bfdbfe;color:#1d4ed8}
  .b3{background:#fffbeb;border-color:#fde68a;color:#b45309}
  button:disabled{opacity:.5;cursor:wait}
  pre{background:#0d1117;color:#e6edf3;padding:18px;border-radius:10px;white-space:pre-wrap;min-height:120px;font:13px/1.5 ui-monospace,monospace}
  .nums{color:#718096;font-size:13px;margin-bottom:16px}
</style></head><body>
  <h1>DailyGate · Live Demo Control</h1>
  <div class="sub">Each button runs the real end-to-end: the agent decides → executes for real → updates the dashboard.</div>
  <div class="nums">Operates on live repo → <a href="https://github.com/REPO_SLUG" target="_blank"><b>REPO_SLUG</b></a></div>
  <div class="row"><button class="b-reset" onclick="reset()">🔄 New demo issues</button></div>
  <div class="nums" id="nums">No issues yet — click “New demo issues”.</div>
  <div class="row">
    <button class="b1" onclick="go('triage','issue-triage')" disabled>▶ Task 1 · Triage → auto-close ✅</button>
    <button class="b2" onclick="go('review','code-review')" disabled>▶ Task 2 · Code review → flag</button>
    <button class="b3" onclick="go('ceiling','candidate-decision')" disabled>▶ Task 3 · Hiring → escalate ⛔</button>
  </div>
  <div class="row">
    <button class="b1" onclick="goEmail()">📧 Task 4 · Thank-you note → send real email</button>
  </div>
  <pre id="out">Ready.</pre>
<script>
  const REPO = "REPO_SLUG";
  let issues = {};
  const out = document.getElementById('out');
  const nums = document.getElementById('nums');
  function setBusy(b){document.querySelectorAll('button').forEach(x=>x.disabled=b)}
  function enableRuns(){document.querySelectorAll('.b1,.b2,.b3').forEach(x=>x.disabled=false)}
  function link(n){return '<a href="https://github.com/'+REPO+'/issues/'+n+'" target="_blank">#'+n+'</a>'}
  async function reset(){
    setBusy(true); out.textContent='Creating fresh GitHub issues…';
    const r = await fetch('/reset',{method:'POST'}); issues = await r.json();
    nums.innerHTML='Live issues: triage '+link(issues.triage)+' · review '+link(issues.review)+' · hiring '+link(issues.ceiling);
    out.textContent='Ready. Click a task.'; setBusy(false); enableRuns();
  }
  async function go(key,cat){
    setBusy(true); out.textContent='▶ Running… (the Guild agent is deciding — ~20s)';
    const r = await fetch('/run?issue='+issues[key]+'&category='+cat,{method:'POST'});
    out.textContent = await r.text(); setBusy(false); enableRuns();
  }
  async function goEmail(){
    setBusy(true); out.textContent='▶ Sending… (agent decides, then emails from your Gmail — ~20s)';
    const r = await fetch('/run?issue=email&category=thank-you-note',{method:'POST'});
    out.textContent = await r.text(); setBusy(false); enableRuns();
  }
</script></body></html>`.replaceAll("REPO_SLUG", REPO);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html" }); res.end(PAGE); return;
  }
  if (req.method === "POST" && url.pathname === "/reset") {
    await run("gh", ["label", "create", "needs-review", "-R", REPO, "--color", "FBCA04", "-d", "DailyGate review"]).catch(() => {});
    const mk = async (t, b) => (await run("gh", ["issue", "create", "-R", REPO, "-t", t, "-b", b])).match(/(\d+)\s*$/)?.[1];
    const triage  = await mk("Fix typo in onboarding docs", "Setup guide says 'recieve'. Minor doc fix.");
    const review  = await mk("Add input validation to /context endpoint", "Validate params before the DB. Quick review.");
    const ceiling = await mk("Decide: hire or pass on candidate Jordan (eng)", "Final call on the eng candidate.");
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ triage, review, ceiling })); return;
  }
  if (req.method === "POST" && url.pathname === "/run") {
    const issue = url.searchParams.get("issue"); const category = url.searchParams.get("category");
    const out = await run("node", ["tiers/demo-live.mjs", issue, category]);
    const clean = out.split("\n").filter((l) => !/Building|Build finished|Skipping local|Workspace:|Session:|Version:|Agent:|Test complete/.test(l)).join("\n");
    res.writeHead(200, { "content-type": "text/plain" }); res.end(clean); return;
  }
  res.writeHead(404); res.end("not found");
}).listen(PORT, () => console.log(`\n▶ DailyGate Live Demo Control → http://localhost:${PORT}\n`));
