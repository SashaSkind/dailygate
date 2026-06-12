-- ClickHouse schema — Person B. Matches /contract/context.schema.json exactly.
-- See data/PLAN.md §4.2 for field semantics. Starter — adjust engines as needed.

CREATE TABLE IF NOT EXISTS work_item (
  id              String,
  source          Enum8('github'=1,'slack'=2,'email'=3),
  title           String,
  owner_suggested Nullable(String),
  age_days        UInt16,
  status          Enum8('open'=1,'in_progress'=2,'stale'=3,'done'=4),
  is_duplicate_of Nullable(String),
  type            Enum8('task'=1,'email'=2,'review'=3)
) ENGINE = MergeTree ORDER BY id;

CREATE TABLE IF NOT EXISTS workload (
  assignee        String,
  kind            Enum8('person'=1,'agent'=2),
  open_tasks      UInt16,
  est_load_score  UInt8           -- 0..100, >70 = overloaded
) ENGINE = MergeTree ORDER BY assignee;

-- Append-only decision log. trust is DERIVED from this (recompute on write).
CREATE TABLE IF NOT EXISTS decision (
  id               String,
  item_id          Nullable(String),
  category         String,
  action           String,
  stakes           Enum8('low'=1,'high'=2),
  reversible       UInt8,          -- 0/1
  was_autonomous   UInt8,          -- 0/1
  manager_response Enum8('approved'=1,'overridden'=2,'edited'=3,'pending'=4,'na'=5),
  timestamp        DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(timestamp) ORDER BY id;  -- ReplacingMergeTree → upsert by id

CREATE TABLE IF NOT EXISTS trust (
  category         String,
  trust_level      Enum8('ask'=1,'auto'=2),
  approvals_count  UInt32,
  overrides_count  UInt32,
  ceiling          UInt8           -- 0/1; 1 = always escalates, never promotes
) ENGINE = ReplacingMergeTree ORDER BY category;
