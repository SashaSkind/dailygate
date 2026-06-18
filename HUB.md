# DailyGate on the Agent Hub (multi-tenant)

DailyGate is multi-tenant: **each org earns its own autonomy from scratch.** The
trust API scopes every row by `tenant`, and an org is identified by the api_key it
connects the trust integration with (`X-Trust-Key`). One shared deployment, fully
isolated trust per org.

## How an external org onboards

1. **Provision a tenant** — one call to the hosted trust API:
   ```bash
   curl -sX POST https://<HOST>/tenants -H 'content-type: application/json' \
        -d '{"name":"Acme Corp"}'
   # → { "tenant": "t-xxxxxxxxxx", "api_key": "dgk_…", "categories": [...] }
   ```
   The org starts with the **full earned-autonomy ladder, every category gated at
   level 0** (high-stakes ones — candidate-decision, code-fix — permanently capped).
   Store the `api_key` — it's shown once.

2. **Install the router** from the Hub (`daily-gate~dailygate-router`).

3. **Connect the `dailygate-trust` integration** in the org's workspace, using the
   `api_key` from step 1 as the `X-Trust-Key` credential. Now every trust call the
   router makes is scoped to *that* org.

4. **Use it.** The agent reads `dailygate_trust_get_context` (live, their data),
   routes by the autonomy each category has earned, and every approval/override the
   manager makes teaches *their* trust model — not anyone else's.

## Isolation guarantees (verified)

- `GET /context`, `/feeds/*`, `/trust/*/explain`, `POST /decision`, `/demo/run` are
  all scoped by the resolving tenant. Missing/unknown key → `401`.
- A new tenant sees 0 of the demo's work items/decisions; its trust ladder is all
  level 0. Earning autonomy in one tenant does not move any other tenant.
- The `demo` tenant (key `demo-key`) preserves the original showcase unchanged.

## Going public on the Hub — run AFTER permanent hosting

The Hub front door is the router; its delegated tiers + the trust integration must
also be public so an external installer can resolve them. Do this **only after the
trust API is on its permanent host and the integration base-url points there** —
otherwise installs break when the dev tunnel dies.

```bash
G() { npx -y @guildai/cli@0.12.3 "$@"; }

# 1. make the entry point + its delegation targets public
for a in router observer reversible routine coder; do
  G agent update daily-gate~dailygate-$a --public --yes
done

# 2. tag the router for discovery
G agent tags add daily-gate~dailygate-router \
  earned-autonomy engineering-manager triage bayesian-trust chief-of-staff

# 3. make the trust integration public/shared so installers can connect it
#    (integration visibility — see `G integration --help`)

# 4. confirm
G agent get daily-gate~dailygate-router | grep is_public   # → true
```

To pull a listing back: `G agent update daily-gate~dailygate-<name> --private --yes`
or `G agent unpublish daily-gate~dailygate-<name>`.
