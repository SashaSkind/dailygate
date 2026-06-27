# DailyGate — the agent that earns trust

> An autonomous **chief-of-staff for engineering managers**. Every action starts
> *gated* (observe-only) and earns the right to act as you approve its work —
> governed by a **Bayesian trust engine**, not a config flag.

## 🎥 ▶ [**WATCH THE 3-MINUTE DEMO**](https://youtu.be/B5a7SoK_7Bs)

---

## The idea: earned autonomy

> Most agents either ask permission for everything (annoying) or act on everything
> (terrifying). DailyGate starts cautious and **earns** autonomy — it learns which
> decisions you trust it to make alone, and which you always want to weigh in on.

Every *category* of decision (issue-triage, capacity-assignment, nudges, code-fixes,
hiring…) enters **observe-only**. As you approve the agent's proposals, a Bayesian
model raises that category's trust and **promotes it through real permission tiers**.
One override demotes it. High-stakes / irreversible categories are capped and always ask.

```
0  observer     read-only — can only surface & escalate
1  reversible    comment / label / nudge
2  routine       assign / close / send email / open a PR
⛔ ceiling       hiring, firing, irreversible — never promotes
```

Promotion isn't a prompt rule — each tier is a **separate Guild agent with different
tools**, so more trust literally hands the work to an agent granted more power.

## How it works

```
GitHub / Slack / email  ──trigger──▶  ROUTER agent (on Guild)
   1. classify the work into a category
   2. read LIVE Bayesian trust for that category   ← trust API (the autonomy_level)
   3. delegate to the matching tier:
        L0 observer · L1 reversible · L2 routine · code-fix → coder (opens a PR)
   4. act, or escalate to the manager
        │
   manager approves / overrides  ──▶  /decision  ──▶  recompute trust
        │                                                  │
   higher trust → acts unattended next time   ·   override → back to asking
   (every decision traced in Langfuse)
```

## The trust engine (what makes it real)

A **Beta-Binomial** posterior per category, in [`data/api/trust.py`](data/api/trust.py):

- Each decision is a time-decayed signal (approved +, override −; **30-day half-life**).
- `trust_score` = Beta MAP estimate; `trust_confidence` saturates with sample size
  (so "3 approvals" ≠ "50 approvals").
- **Dynamic thresholds** by inferred risk (low 0.70 / med 0.80 / high 0.92), nudged by
  the team's override rate.
- Promotion needs score ≥ threshold **and** enough confidence — one lucky approval
  can't unlock autonomy. **Override → immediate demotion. Ceiling → never promotes.**

## Multi-tenant

The trust API is multi-tenant: each org connects with its own **`X-Trust-Key`** and
earns its **own** autonomy in full isolation. `POST /tenants` provisions a new org
(fully gated from zero); `demo-key` serves the seeded showcase org.

## Architecture

```
┌─ Agent layer (Guild, TypeScript) ───────────────┐   ┌─ Trust layer (Python) ─────────┐
│  router → observer / reversible / routine        │   │  FastAPI + SQLite              │
│          coder (PRs) · digest · scheduler        │──▶│  Bayesian trust engine         │
│          statusdoc · linear                      │   │  /context /decision /tenants   │
│  triggers: issues.opened, pr.opened, daily cron  │   │  /gather /trust/{c}/explain    │
└──────────────────────────────────────────────────┘  └────────────────────────────────┘
        │                                                         ▲
   React dashboard (ui/) ── trust ladder, escalation queue, ─────┘
   teach controls, promotion toasts, connect-repo, onboarding
```

**Live trust API:** https://SashaSk-dailygate-trust.hf.space (Hugging Face Spaces)

## Tech stack

**Guild** (agent runtime, tiered agents, integrations, triggers) ·
**Python / FastAPI / SQLite** (the trust engine) ·
**Composio** (Gmail bridge) · **GitHub / Slack / Google / Linear** integrations ·
**Langfuse** (decision traces) · **React + Vite** (dashboard) ·
**Hugging Face Spaces** (hosting) · **Bayesian inference**.

## Repo layout

```
router/        the installable entry point — classifies + reads live trust + delegates
tiers/         observer (L0) · reversible (L1) · routine (L2) — real tool-grant tiers
coder/         opens real PRs in a sandboxed container
digest/ scheduler/ statusdoc/ linear/   extra capabilities (Slack/Calendar/Docs/Linear)
data/api/      the Bayesian trust engine — FastAPI + SQLite (deployed to HF Spaces)
ui/            the manager dashboard — React + Vite
CAPABILITIES.md · HUB.md · ONBOARDING.md   docs
```

## Run locally

```bash
# 1. Trust API  (FastAPI + SQLite)  → :8001
cd data/api && pip install -r requirements.txt
uvicorn main:app --port 8001

# 2. Dashboard  → http://localhost:5173  (proxies /api → :8001)
cd ui && npm install && npm run dev
#    first run shows onboarding — pick "Explore the demo" (uses demo-key)

# 3. Agents  (after `npx -y @guildai/cli@0.12.3 auth login`)
cd router && npx -y @guildai/cli@0.12.3 agent test --workspace daily-gate/team --mode json
```

## Try the multi-tenant story

```bash
# provision a fresh org → get its key → it starts fully gated
curl -sX POST https://SashaSk-dailygate-trust.hf.space/tenants \
  -H 'content-type: application/json' -d '{"name":"Acme"}'
# in the dashboard, click the org pill → paste the key → earn autonomy from zero
```
