# contract/ — the frozen seam 🔒

The single source of truth between the **Agent lane (A)** and the **Data lane (B)**.
Do not change a field without telling the other lane.

```
types.ts             ← canonical TypeScript types (A and UI mirror these)
context.schema.json  ← JSON Schema (B can validate responses against it)
fake_context.json    ← STARTER fixture. A's skeleton runs on this until the handshake.
                       B replaces/expands it from the real seed at milestone B-α.
```

## The two endpoints
```
GET  /context  → { work_items[], workload[], trust[] }      (arg-less snapshot)
POST /decision → upsert by id · recompute trust · return { decision, trust }
```

## Frozen constants
- **N = 3** consecutive approvals → `ask` promotes to `auto`
- **any override** → `auto` drops to `ask`
- **ceiling categories** (e.g. `candidate-decision`) → ALWAYS escalate, never promote
- **load > 70** = overloaded
- `assignee` = a person **or** an agent (lowercase slug)
- the triggering event reaches the agent from **Guild**, not from `/context`
