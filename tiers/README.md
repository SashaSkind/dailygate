# tiers/ — earned autonomy as real Guild permissions

The differentiator, made concrete. Instead of one agent deciding "act vs escalate"
in a prompt, we run **separate agents whose tool grants actually differ**, and a
router picks which one handles a work item based on the **earned autonomy level**.
Promotion doesn't flip a flag — it routes the work to an agent that *physically
has* the next tool. The capability gap is governed by Guild.

## The ladder (3 tiers)
```
observer/    L0  read-only (github read)                         → can only ESCALATE
reversible/  L1  + comment, label, nudge (reversible, low-stakes) → ACTS on reversible work, escalates the rest
routine/     L2  + assign, close, send email (composio_gmail)     → ACTS on routine work
router.mjs       reads autonomy_level → picks the tier → invokes that Guild agent
```
Ceiling categories (e.g. `candidate-decision`) are **capped at L0** regardless of score.

## Run it
```bash
node tiers/router.mjs gh-389              # nudge, level 1   → REVERSIBLE → posts a nudge comment
node tiers/router.mjs gh-412 --level 1    # close needs L2   → REVERSIBLE → ESCALATES (lacks the tool)
node tiers/router.mjs gh-412              # issue-triage L2  → ROUTINE    → closes + assigns
node tiers/router.mjs email-7             # thank-you L2     → ROUTINE    → sends email via Composio
node tiers/router.mjs email-3             # candidate (ceiling) → OBSERVER → ESCALATES, always
```

## Proven behaviour
| Item | Category | Level | Tier | Outcome |
|---|---|---|---|---|
| gh-389 | nudge | 1 | REVERSIBLE | `ACTED` — posted nudge via `github_issues_create_comment` |
| gh-412 | issue-triage | 1 (forced) | REVERSIBLE | `ESCALATE` — close needs L2; **level 1 lacks the tool** |
| gh-412 | issue-triage | 2 | ROUTINE | `ACTED` — close + assign |
| email-7 | thank-you-note | 2 | ROUTINE | `ACTED` — sent email via `composio_gmail` |
| email-3 | candidate-decision | ceiling | OBSERVER | `ESCALATE` — **capped at L0** |

Each tier can only do what Guild granted it. A category climbs the ladder as the
manager keeps approving — and the ceiling is a rung it can never reach.

## Write-back loop (closes the earned-autonomy cycle)
After a tier agent acts or escalates, the router **POSTs the outcome to `/decision`**:
- `ACTED`    → `manager_response="n/a"`     → appears in `/feeds/autonomy`, raises the Bayesian score
- `ESCALATE` → `manager_response="pending"` → appears in `/feeds/escalations` (the UI queue)

The manager approving/overriding in the UI upserts the same decision id → trust recomputes
→ the category can cross a band and the **next** run routes to a higher tier. That's the loop.

> Demo reset: running the router mutates trust. Before recording, reseed:
> `rm data/api/dailygate.db*` then restart the API (it reseeds on startup).

## How it maps to production
- `--level` is demo-only. In production the router reads `autonomy_level` from
  **ClickHouse** — Person B's **Bayesian** pipeline computes it from approval history
  (`trust_score` 0..1 → a level). Approvals raise it; overrides lower it.
- Router is a local script here for a clean proof. Productionized = a Guild router
  agent delegating via `guildAgentTool()`; same logic.
- Each tier is its own Guild agent (`dailygate-observer/-reversible/-routine`),
  tested on the ephemeral working dir (no publish needed).
