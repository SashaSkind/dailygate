---
title: DailyGate Trust API
emoji: 🚪
colorFrom: green
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# DailyGate — Trust API

The Bayesian **earned-autonomy** trust engine behind [DailyGate](https://github.com/SashaSkind/dailygate).

Every action category starts gated (observe-only) and earns the right to act as the
manager approves it. This service computes per-category trust (Beta-Binomial posterior
with time-decay + confidence gating) and is **multi-tenant**: each org connects with its
own `X-Trust-Key` and earns its own autonomy in isolation.

## Endpoints
- `GET /health` — liveness
- `GET /context` — per-tenant snapshot (work items, workload, trust ladder)
- `POST /decision` — record an approval/override → recompute trust
- `POST /tenants` — provision a new org (returns an api_key)
- `POST /gather` — pull real GitHub issues into a tenant's work queue
- `GET /trust/{category}/explain` — full audit + path-to-promotion
- `GET /feeds/*` — dashboard feeds

All endpoints except `/health` and `/tenants` require an `X-Trust-Key` header.
The `demo-key` serves the seeded showcase org.
