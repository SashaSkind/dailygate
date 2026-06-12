# data/ — Data + Trust lane (Person B)

**Read [PLAN.md](PLAN.md) first — it's the full brief for this lane.**

```
PLAN.md        ← your complete marching orders (product, seam, seed, workflow)
schema.sql     ← ClickHouse tables (matches the frozen contract)
seed/          ← TODO(B): seed dataset + approval history (PLAN.md §5)
queries/       ← TODO(B): who's-overloaded / what's-stale / what's-a-dup / trust recompute
api/           ← TODO(B): serve GET /context + POST /decision + /feeds/*  (PLAN.md §6 B6–B7)
```

Endpoints the agent + UI expect (base URL you hand to Person A at the handshake):
- `GET  /context`            → `{ work_items, workload, trust }`
- `POST /decision`           → upsert by id, recompute trust, return `{ decision, trust }`
- `GET  /feeds/autonomy`     → recent decisions where `was_autonomous = true`
- `GET  /feeds/escalations`  → decisions where `manager_response = "pending"`

Frozen: **N=3 → auto · override → ask · ceiling never promotes · load>70 overloaded.**
