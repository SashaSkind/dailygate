# DailyGate capabilities

DailyGate is an earned-autonomy agent: every new capability enters as a **new
category** in the Bayesian trust engine, starts gated (observe-only), and earns the
right to act as the manager approves it. Below is what's built, using Guild's
agent + integration + trigger surface.

All agents are **org-owned** (`daily-gate`) and in the **`daily-gate/team`** workspace.

## Core ladder (earned autonomy)
| Agent | Role |
|---|---|
| `dailygate-router` | the installable entry point; classifies a work item and delegates to a tier |
| `dailygate-observer` | L0 — read-only; can only escalate |
| `dailygate-reversible` | L1 — comment / label / nudge |
| `dailygate-routine` | L2 — assign / close / send email (Composio) |
| `dailygate-agent` | trigger handler; wakes on GitHub events and triages autonomously |

## New capabilities (built this session)
| Agent | Capability | Guild surface used | Status |
|---|---|---|---|
| `dailygate-coder` | fix a **trivial issue** in a sandboxed container and **open a PR** | experimental coding agent + GitHub git API | published + validated; live PR via web UI (long container run) |
| `dailygate-digest` | **daily summary** of repo activity → posted to Slack | GitHub + Slack + **time/cron trigger** | live (DAILY 09:00 trigger active) |
| `dailygate-scheduler` | **book meetings** (interview, 1:1) on Google Calendar | Google Calendar | published + validated; needs calendar connected to run live |
| `dailygate-statusdoc` | write a **team status page** to Google Docs | GitHub + Google Docs | published + validated; needs docs connected |
| `dailygate-linear` | capacity-aware **Linear** triage (beyond GitHub) | Linear | published + validated; needs Linear connected |

## Triggers (event-driven autonomy)
| Trigger | Fires | Agent |
|---|---|---|
| `issues.opened` (webhook) | a GitHub issue is opened | `dailygate-agent` |
| `pull_request.opened` (webhook) | a PR is opened | `dailygate-agent` |
| daily `09:00` (time) | every morning | `dailygate-digest` |

## Run them
```bash
# router (earned-autonomy delegation)
cd router && echo '{"id":"gh-3","title":"...","needed_action":"..."}' | guild agent test --workspace daily-gate/team --mode json
# any capability agent: cd into its dir and `guild agent test`
# coder needs the web UI for the full PR:  cd coder && guild agent test --open
```

## What's needed to run the not-yet-live ones
The scheduler / statusdoc / linear agents are **published and validated** (they
compile against their integrations and are installable). To run them live, connect
the integration in the org (app.guild.ai → org `daily-gate` → Integrations):
**Google Calendar**, **Google Docs**, **Linear**. They then work with no code change.

## Why this scales safely
Each capability is just another trust category. Scary ones (editing code, sending
email, booking time) **start locked** and have to earn autonomy — so the system can
grow powerful without growing reckless. That's the whole thesis, and it's what makes
adding capabilities cheap and safe.
