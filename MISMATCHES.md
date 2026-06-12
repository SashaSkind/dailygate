# MISMATCHES — RESOLVED ✅

The two lanes (A = agent/tiers/ui, B = data/api) were built in parallel, merged,
then reconciled. All seams below are fixed and verified end-to-end on `main`.

| # | Mismatch | Fix | Verified |
|---|----------|-----|----------|
| 1 | API didn't emit `autonomy_level` (router's routing signal) | `trust.py::autonomy_level()` derives it from the Bayesian score (`REVERSIBLE_BAND=0.55`); `main.py::_trust()` emits it | `/context` → all 6 rows carry L0/L1/L2 ✓ |
| 2 | `seed.py` printed logs into the JSON file → invalid JSON | logs routed to **stderr** via `_log()` | `python seed.py` → stdout 0 bytes ✓ |
| 3 | Feed shape: UI expected `Decision[]`, API returns `{decisions:[…]}` | `ui/src/api.ts` unwraps `.decisions` | `/feeds/*` keys = `['decisions']` ✓ |
| 4 | `POST /decision` contract | already upserts by `id` + returns `{decision, trust}` | confirmed in `main.py` ✓ |
| 5 | Router read the local fixture, not the live API | `tiers/router.mjs` fetches `${API_BASE}/context` (default `:8001`), falls back to fixture | live fetch returns autonomy_level ✓ |
| 6 | naming `confidence` vs `trust_confidence` | standardized on `trust_confidence` (contract + UI) | grep clean ✓ |

## Verified autonomy levels (live API, from the Bayesian engine)
```
issue-triage         score 0.76  →  L2 routine
capacity-assignment  score 0.74  →  L2 routine
thank-you-note       score 0.70  →  L2 routine
code-review          score 0.72  →  L1 reversible
nudge                score 0.58  →  L1 reversible
candidate-decision   score 0.33  →  L0 observer (ceiling)
```
These match the values in `contract/fake_context.json` exactly.

## How to run the unified stack
```bash
# 1. data API (Bayesian trust engine)
cd data/api && pip install -r requirements.txt && python -m uvicorn main:app --port 8001
# 2. router against the live API
API_BASE=http://localhost:8001 node tiers/router.mjs gh-389   # → L1 REVERSIBLE
API_BASE=http://localhost:8001 node tiers/router.mjs email-3  # → L0 OBSERVER (ceiling)
# 3. UI dashboard
cd ui && npm install && npm run dev                           # reads :8001 via proxy
```

## Optional follow-ups (not blocking)
- Regenerate `contract/fake_context.json` from the live API so the static fixture and
  engine never drift (export `GET /context` → file; logs already go to stderr).
- `agent/agent.ts` (single-agent skeleton) still embeds `fixture.ts`; the tier router
  is the live path. Wire the skeleton to `/context` only if we still demo it.
- Connect the Composio API key so the routine tier *sends* email for real (`guild
  integration connect sashaskind~composio-gmail`).
