# MISMATCHES — fix together after the merge

The two lanes (A = agent/tiers/ui, B = data/api) were built in parallel and merged.
Code is unified; these are the **semantic** seams to reconcile together. Ordered by
priority. Owner = who should drive the fix.

---

## 1. Trust shape: derive `autonomy_level` inside the engine  ·  owner B (with A)
- The router reads **`autonomy_level` (0|1|2)** — the agreed routing signal (3 tiers:
  observer / reversible / routine). B's engine currently emits binary `trust_level`
  (ask/auto) + `trust_score`.
- **Temporary:** `autonomy_level` was hand-derived into `contract/fake_context.json`
  (issue-triage/capacity/thank-you = 2, code-review/nudge = 1, candidate = 0).
- **Fix:** `data/api/trust.py` should compute `autonomy_level` from `trust_score`
  using two bands (not one auto_threshold). Agree the bands, e.g.:
  `>= auto_threshold → 2 · >= reversible_threshold (~0.5) → 1 · else → 0`. Ceiling → 0.
- Keep `trust_level` only as a derived convenience (or drop it).

## 2. Seed export writes invalid JSON  ·  owner B
- `contract/fake_context.json` had two log lines printed **above** the `{`
  ("Seeded: 30 work items…" / "Trust scores recomputed…") → `JSON.parse` fails.
- Stripped in the merge, but **`data/api/seed.py` will re-break it** on next export.
- **Fix:** send those `print()`s to **stderr**, or write the file with `json.dump`
  only. The file must be pure JSON.

## 3. API port + endpoints  ·  owner B (verify), A (consume)
- B's API runs on **:8001** (UI `.env.example` + `vite.config.ts` now point there).
- UI expects: `GET /context`, `POST /decision`, `GET /feeds/autonomy`,
  `GET /feeds/escalations`. **Verify `data/api/main.py` exposes all four** (esp. the
  two `/feeds/*` the dashboard reads).

## 4. `POST /decision` contract  ·  owner B (verify), A
- Must **upsert by `id`** (re-call flips `pending → approved`) and return
  `{ decision, trust }` with the **updated** trust row for that category.
- Confirm B's handler matches `contract/types.ts` `DecisionInput` / `DecisionResult`.

## 5. Wire the agent + router to the LIVE API  ·  owner A (needs B's API up)
- Right now `agent/fixture.ts` and `tiers/router.mjs` read the local
  `contract/fake_context.json`. Swap to `GET http://localhost:8001/context`.
- Cleanest Guild-native path: register B's API as a Guild integration (OpenAPI),
  like the Composio bridge — then the agent gets `context` / `decision` tools.

## 6. Naming: `trust_confidence` (not `confidence`)  ·  done, verify
- Merged contract + UI now use **`trust_confidence`** (matches B's data). Confirm no
  stray `confidence` references remain in either lane.

---

## Already reconciled in the merge
- `.gitignore` — unioned (python + db ignores from B).
- `ui/.env.example`, `ui/vite.config.ts` — took B's `:8001`.
- `contract/types.ts` — unioned: `autonomy_level` (routing) + B's Bayesian fields
  (`trust_score`, `trust_confidence`, `auto_threshold`, `risk_profile`, `last_event`).
- `contract/fake_context.json` — B's real 30-item seed, JSON fixed, `autonomy_level` added.

## Verify after fixes
```bash
python3 -c "import json;json.load(open('contract/fake_context.json'));print('json ok')"
node tiers/router.mjs gh-412     # → ROUTINE acts
node tiers/router.mjs email-3    # → OBSERVER escalates (ceiling)
cd ui && npm run dev             # dashboard reads :8001
```
