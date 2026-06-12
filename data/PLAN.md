# PLAN — Person B (Data + Trust Lane)

> **You are Person B's Claude Code.** This is your full brief. Read it top to
> bottom once. You own the **DATA + TRUST** lane. Person A owns the **AGENT** lane.
> You two build in parallel and meet at ONE handshake (~2:30pm). Everything you
> need to never block on Person A is in here. Submit by **4:30pm**.

---

## 0. TL;DR — what you build

1. A **ClickHouse** database with 4 tables: `work_item`, `workload`, `decision`, `trust`.
2. A **seed dataset** crafted to make the demo land (overloaded person, forgotten
   tasks, a duplicate, and a pre-seeded approval history so "earned trust" is
   already visible on day one).
3. **Context queries** (who's overloaded / what's stale / what's a duplicate) and
   the **trust recompute** logic (approvals raise autonomy, overrides lower it).
4. A tiny **HTTP API** serving exactly **two endpoints** — `context()` and
   `decision()` — that Person A's agent calls as tools.
5. **OpenUI data feeds** (read queries) for the supervision dashboard.

Your north star: when Person A points their agent at your API at ~2:30, it Just
Works, and the seed data makes the agent look brilliant on camera.

---

## 1. The product (what we're building — full context)

An **autonomous team-management agent that earns trust over time.** It runs
continuously, managing a team's work across GitHub / Slack / email.

**The core thesis:** Autonomy is the default; human input is the exception. AND
the line between "act alone" and "ask first" MOVES based on what the manager has
approved before.

- **Routine, reversible, high-confidence work** (close a duplicate issue, assign
  by capacity, nudge a stalled task, send a thank-you) → the agent **just acts**.
- **High-stakes / irreversible work** (reject/hire a candidate, reassign a major
  project, anything touching money or a person's standing) → it **escalates** and
  waits for the manager.
- **The learning loop (the differentiator):** the agent records every decision —
  what it did alone, what it escalated, how the manager responded. If the manager
  keeps approving a *category*, the agent **earns autonomy** there (starts acting
  without asking). If the manager overrides, it **loses autonomy** there. There's
  a **hard ceiling**: genuinely big/irreversible categories ALWAYS escalate, no
  matter how much trust is earned.

**One-liner:** "Most agents either ask permission for everything (annoying) or act
on everything (terrifying). Ours starts cautious and *earns* autonomy."

**Why this matters for you:** the "earned autonomy" loop is **literally queries
over the data you own** (the `decision` history → the `trust` levels). Your tables
ARE the trust mechanism. This is the most load-bearing data lane possible.

---

## 2. The architecture (where everything lives, and how your data is consumed)

```
GitHub/Slack event
   │  Guild TRIGGER  ── wakes Person A's agent (native; event payload comes from Guild)
   ▼
Person A's agent  (TypeScript, runs inside Guild's managed runtime)
   ├─ context()          → YOUR API: work_items, workload, trust[category]
   ├─ DECIDE (A's policy):
   │     if (stakes HIGH & irreversible)             → ALWAYS escalate   ← hard ceiling
   │     else if (trust[cat]=="auto" & confident)    → ACT
   │     else                                        → escalate
   ├─ ACT      → Composio  (assign / close dup / email / Slack post)
   ├─ ESCALATE → Guild ui_prompt  (blocks for the manager)
   └─ decision()         → YOUR API: writes the decision, you recompute trust, return it
                           (upsert: re-called to flip pending→approved after manager responds)
   every branch traced → Langfuse
OpenUI / Thesys dashboard  → reads YOUR feeds: autonomy feed, escalation queue, trust dashboard
```

**Key fact about the split:** Guild has **no programmable permission/policy API** —
we checked the docs. So the trust policy does NOT live in Guild. **It lives in
YOUR ClickHouse layer.** Guild only gives Person A two primitives: *triggers* (wake
the agent) and *ui_prompt* (the escalation gate). The brains of "earned autonomy"
are your queries. That's why this lane matters.

**Division of labor on trust:** YOU compute `trust_level` (the SQL over decision
history). Person A *consumes* it (reads it, branches on it). You own the math; A
owns the application.

---

## 3. What Person A is doing (your consumer — so you know who you're serving)

Person A is building, in TypeScript, inside Guild:
- A Guild agent (`llmAgent`, multi-turn loop) woken by Guild triggers on real
  GitHub/Slack events.
- A **classify step**: for each work item / event, the agent assigns
  `category`, `stakes` (low/high), `reversible` (bool), `confidence`.
- An **act-vs-escalate branch** that reads `trust[category]` **from your API** and
  decides: act autonomously (via Composio) or escalate (via Guild's `ui_prompt`).
- After acting/escalating, it calls **your `decision()`** to record what happened;
  on escalations it re-calls `decision()` (same `id`) to flip `pending→approved`
  once the manager responds.
- Langfuse tracing on the decision path, and an OpenUI dashboard that reads your
  feeds.

**What A needs from you, concretely:**
1. A `fake_context.json` early (so A's skeleton runs on demo-shaped data before
   your live API exists).
2. The live `context()` + `decision()` endpoints at a URL by ~2:30.
3. The trust recompute behaving exactly per the frozen rule (so A's branch is
   correct).
4. Read feeds for the dashboard.

A classifies `category/stakes/reversible/confidence` and sends them to you. **You
do not classify** — you store what A sends and do the trust math. Keep that
boundary clean.

---

## 4. THE FROZEN SEAM (your primary spec — do not deviate)

Person A codes against this. It is locked. The four row types and two endpoints:

### 4.1 The two endpoints (HTTP, JSON)

```
GET  /context
     → 200 { work_items: WorkItem[], workload: Workload[], trust: Trust[] }
     // full snapshot. NO query args. A reads this at the top of every run.
     // (The triggering event comes to A from Guild, NOT from you.)

POST /decision   body: DecisionInput
     → 200 { decision: Decision, trust: Trust }
     // 1. UPSERT the decision by `id` (re-called to flip pending→approved)
     // 2. recompute trust for decision.category (frozen rule, §4.3)
     // 3. return the stored decision + the UPDATED trust row for that category
```

Serve these however is fastest for you (FastAPI / Flask / Express — your choice;
A only sees HTTP+JSON). Bind to a host:port and hand A the base URL at the handshake.

### 4.2 The four types (EXACT field names, types, enums)

**`WorkItem`** — you serve, A only reads.
| field | type | values |
|---|---|---|
| `id` | string | source-prefixed unique, e.g. `"gh-412"`, `"slack-88"`, `"email-7"` |
| `source` | enum | `github` \| `slack` \| `email` |
| `title` | string | |
| `owner_suggested` | string \| null | an `assignee` id (person or agent); null = unassigned |
| `age_days` | number | drives "stale" |
| `status` | enum | `open` \| `in_progress` \| `stale` \| `done` |
| `is_duplicate_of` | string \| null | another `work_item.id`; null = not a dup |
| `type` | enum | `task` \| `email` \| `review` |

**`Workload`** — you serve, A reads. Tracks **people AND agents** as assignees.
| field | type | values |
|---|---|---|
| `assignee` | string | lowercase slug, e.g. `"sasha"`, `"alex"`, `"triage-bot"` |
| `kind` | enum | `person` \| `agent` |
| `open_tasks` | number | count of open items owned |
| `est_load_score` | number | **0–100**; **>70 = overloaded** (FROZEN threshold) |

> Note: join key is `assignee` (person OR agent). Keep ids consistent across all
> tables (`work_item.owner_suggested` references an `assignee`).

**`Decision`** — A writes via `/decision`, you store.
| field | type | values | set by |
|---|---|---|---|
| `id` | string | uuid (A generates so it can re-call to upsert) | A |
| `item_id` | string \| null | a `work_item.id` | A |
| `category` | string | e.g. `issue-triage`, `capacity-assignment`, `candidate-decision`, `thank-you-note`, `nudge` | A |
| `action` | string | human-readable, e.g. `"closed gh-412 as dup of gh-389"` | A |
| `stakes` | enum | `low` \| `high` | A |
| `reversible` | bool | | A |
| `was_autonomous` | bool | true = acted alone; false = escalated | A |
| `manager_response` | enum | `approved` \| `overridden` \| `edited` \| `pending` \| `n/a` | A |
| `timestamp` | string | ISO 8601 | you (on write) |

> `manager_response` is `n/a` for autonomous actions, `pending` when first
> escalated, then upserted to `approved`/`overridden`/`edited`.

**`Trust`** — YOU own and compute. A reads, never writes directly.
| field | type | values |
|---|---|---|
| `category` | string | matches `Decision.category` |
| `trust_level` | enum | `ask` \| `auto` (what A's branch reads) |
| `approvals_count` | number | running |
| `overrides_count` | number | running |
| `ceiling` | bool | true = **always escalates**, trust can NEVER promote it |

### 4.3 Trust recompute — THE FROZEN RULE (your core logic)

On every `POST /decision`, recompute the category's `Trust` row exactly like this:

```
on decision(d):
  upsert d by d.id
  t = trust[d.category]                 // create with trust_level="ask" if new
  if t.ceiling:                         // ceiling categories never promote
      return t                          // (still record counts if you like, but never auto)
  if d.manager_response == "approved" or d.was_autonomous:
      t.approvals_count += 1
  if d.manager_response in ("overridden", "edited"):
      t.overrides_count += 1
      t.trust_level = "ask"             // ANY override demotes immediately
  if consecutive_approvals(d.category) >= 3:   // N = 3, FROZEN
      t.trust_level = "auto"
  save t
  return t
```

**Frozen constants** (must match A's policy):
- **N = 3** consecutive approvals (with no override since) promotes `ask → auto`.
- **load > 70 = overloaded.**
- "consecutive" = since the last override in that category. An override resets the
  streak AND sets `trust_level="ask"`.

---

## 5. THE SEED DATASET (this is the demo — craft it deliberately)

The seed is not filler — it's the script of the demo. Build it so the agent's
behavior is obviously smart on camera. Target: **5 assignees, ~30 work items.**

### 5.1 The 5 assignees (people + agents)
- `sasha` (person) — **the overloaded one**: `open_tasks: 6`, `est_load_score: 82`
  (>70). She "owns" a hot module, so naive assignment would pile more on her — the
  agent should reassign by capacity instead.
- `alex` (person) — light: `open_tasks: 2`, `est_load_score: 30`. The natural
  capacity-based target.
- `priya` (person) — medium: `open_tasks: 4`, `est_load_score: 55`.
- `marco` (person) — light-medium: `open_tasks: 3`, `est_load_score: 45`.
- `triage-bot` (agent) — `kind: agent`, handles routine triage:
  `open_tasks: 1`, `est_load_score: 15`. (Shows the "people AND agents" point and
  seeds the vision slide.)

### 5.2 The ~30 work items — bake in these set pieces
- **A duplicate:** `gh-412` ("Fix login race") with `is_duplicate_of: "gh-389"`.
  → agent closes it autonomously (issue-triage is `auto`). Demo beat #2.
- **An overload trap:** an open task whose `owner_suggested: "sasha"` (load 82).
  → agent reassigns to `alex` by capacity. The killer behavior.
- **Forgotten small tasks:** a `type:"email"` thank-you note `age_days: 9`,
  `status:"stale"`; a stale follow-up `age_days: 12`. → agent nudges/sends. The
  emotional hook.
- **The high-stakes escalation:** a `candidate-decision` item (e.g. an `email`
  "Candidate rejection — Jordan", or model it as a work item the agent must act on)
  → category maps to `ceiling:true` → ALWAYS escalates. Demo beat #3.
- Fill the rest with a realistic spread of `task`/`review` items across the 5
  assignees, varied `age_days` and `status`, so workload numbers are believable.

### 5.3 The seeded approval history (makes "earned trust" visible day one)
Pre-load the `decision` + `trust` tables so the trust dashboard already tells a
story (this is demo beat #4 — the differentiator):
- `issue-triage` → `trust_level: "auto"`, `approvals_count: 5`, `overrides_count: 0`,
  `ceiling: false`. (Earned — the agent now closes dups on its own.)
- `capacity-assignment` → `trust_level: "auto"`, `approvals_count: 4`. (Earned.)
- `thank-you-note` / `nudge` → `trust_level: "auto"`, `approvals_count: 3`.
- `candidate-decision` → `trust_level: "ask"`, `ceiling: true`. **Always escalates,
  no matter what.** (The hard ceiling — the trust beat's punchline.)
- Optionally seed ONE category mid-journey (`approvals_count: 2`, still `ask`) so
  you can show it about to flip — "one more approval and it earns this."

Seed a backlog of ~15–20 historical `decision` rows consistent with those counts
(mostly `was_autonomous:true` or `manager_response:"approved"`, a couple of
`overridden` early on to show the level moved).

> The story the dashboard must tell: "Two days ago it asked before every
> capacity-assignment. You approved them all. Now it does them alone — it earned
> that. Candidate decisions? Still escalated, always will be."

---

## 6. YOUR ORDERED WORKFLOW (do these in this order)

```
B1. ClickHouse up + connection. Create tables: work_item, workload, decision, trust
        (schema matches §4.2 exactly — same field names/enums).
B2. Seed the dataset per §5 (5 assignees, ~30 items, set pieces).
B3. Seed the approval history + trust rows per §5.3 (incl. candidate-decision ceiling).
    ── MILESTONE B-α (≈30 min in): export a /contract/fake_context.json from the
       real seed and HAND IT TO PERSON A. This unblocks A's whole skeleton early.
B4. Context queries: who's-overloaded (load>70), what's-stale (age/status), what's-a-dup.
B5. Trust recompute (the FROZEN rule, §4.3): consecutive≥3 → auto; override → ask;
        ceiling never promotes.
B6. Serve the two endpoints: GET /context (arg-less snapshot) + POST /decision
        (upsert by id + recompute + return decision & updated trust).
    ── MILESTONE B-β (≈2:30): endpoints live at a URL → GIVE PERSON A THE BASE URL.
       This is THE handshake. A swaps fake_context.json → your live URL.
B7. OpenUI data feeds (read queries A's dashboard renders):
        - autonomy-feed: recent decisions where was_autonomous=true
        - escalation-queue: decisions where manager_response="pending"
        - trust-dashboard: the trust table (level + counts + ceiling per category)
B8. Tune seed/trust so the demo arc lands — verify the agent visibly acts on the
        dup + the overload reassignment + the nudges, and escalates ONLY the
        candidate decision, and the dashboard shows earned auto vs the ceiling.
```

**Milestones that matter:** B-α (hand A the fake JSON) early, B-β (hand A the URL)
by ~2:30. Everything else is yours to sequence.

---

## 7. The handshake & timeline

```
B-α  (~30 min in)  →  you give A  /contract/fake_context.json   (A's skeleton uses it)
B-β  (~2:30pm)     →  you give A  the live API base URL          (A swaps fake→real)
```

| Time | You (B) | Person A (for reference) |
|---|---|---|
| now | B1–B3: tables + seed + history | Guild scaffold + fake-data skeleton |
| +30m | **B-α: hand A fake_context.json** | A points skeleton at it |
| → 2:30 | B4–B6: queries + recompute + endpoints | Composio actions, ui_prompt, Langfuse |
| **2:30** | **B-β: hand A the live URL** | A swaps fake → your live API |
| 2:30–3:45 | B7–B8: feeds + tune demo | OpenUI dashboard wired to your feeds |
| 3:45–4:30 | joint: dry run, record 3-min demo, push public repo (gitignore secrets/data) | |

You have **no blocker on A**. A's only blockers on you are B-α (fake JSON) and B-β
(live URL). Ship B-α ASAP — it's a 30-min gift that de-risks the whole integration.

---

## 8. Tech notes & your choices

- **Language: your call.** A only sees HTTP+JSON, so Python (FastAPI) + the
  ClickHouse Python client is the comfortable path and our team knows ClickHouse.
- **ClickHouse:** use the hackathon-provided instance if the onboarding doc has one;
  else ClickHouse local/Docker is fine for the demo. Confirm the connection string
  with Sasha (she's relaying onboarding creds).
- **The API can be thin** — it's 2 endpoints over a handful of queries. Don't
  over-engineer. Correctness of the trust recompute + realism of the seed are what
  matter.
- **`/contract/`** is the shared frozen folder. `context.schema.json` (the types)
  and `fake_context.json` (your seed export) live there. Don't change the schema
  without telling A.
- **Gitignore** any secrets and raw data dumps. One public repo by 4:30.

---

## 9. Definition of done (your lane)

- [ ] 4 tables created, schema matches §4.2 exactly.
- [ ] Seed: 5 assignees (incl. 1 agent), ~30 items, the dup + overload + forgotten
      + candidate set pieces present.
- [ ] Approval history seeded so `issue-triage`/`capacity-assignment` are `auto`
      and `candidate-decision` is `ceiling:true` + `ask`.
- [ ] `/contract/fake_context.json` exported and handed to A (B-α).
- [ ] `GET /context` returns the full snapshot; `POST /decision` upserts +
      recomputes trust (frozen rule) + returns updated trust.
- [ ] Override demotes to `ask`; 3 consecutive approvals promotes to `auto`;
      ceiling never promotes — verified with a quick manual test.
- [ ] Live URL handed to A (B-β) by ~2:30.
- [ ] OpenUI feeds (autonomy / escalation / trust) query cleanly.
- [ ] Demo arc verified end-to-end with A.

---

## 10. The seam, restated (pin this above your desk)

```
GET  /context  → { work_items[], workload[], trust[] }          // arg-less snapshot
POST /decision → upsert by id, recompute trust, return {decision, trust}
N = 3 approvals → ask→auto    |    any override → ask    |    ceiling → never promotes
load > 70 = overloaded    |    assignee = person OR agent    |    you compute trust, A reads it
```

Build the data so the agent looks smart. That's the whole job. Go.
