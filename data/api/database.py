"""
SQLite-backed store for DailyGate.
Schema mirrors data/schema.sql exactly for the original four tables.
New tables: trust_events (Bayesian engine audit log), tenants (multi-tenancy).

Multi-tenancy: every row carries a `tenant` id. Each org connects the trust
integration with its OWN api_key; the `tenants` table maps api_key → tenant, and
every query is scoped by tenant. So each org earns its OWN autonomy from scratch —
the whole thesis, per-tenant. The `demo` tenant preserves the original single-org
behaviour for the showcase.
"""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "dailygate.db"

# The demo tenant + its key. Kept stable so the showcase integration keeps working.
DEMO_TENANT = "demo"
DEMO_TRUST_KEY = os.environ.get("DEMO_TRUST_KEY", "demo-key")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS tenants (
            api_key   TEXT PRIMARY KEY,
            tenant    TEXT NOT NULL,
            name      TEXT,
            created   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS work_item (
            tenant          TEXT NOT NULL DEFAULT 'demo',
            id              TEXT NOT NULL,
            source          TEXT NOT NULL CHECK(source IN ('github','slack','email')),
            title           TEXT NOT NULL,
            owner_suggested TEXT,
            age_days        INTEGER NOT NULL DEFAULT 0,
            status          TEXT NOT NULL CHECK(status IN ('open','in_progress','stale','done')),
            is_duplicate_of TEXT,
            type            TEXT NOT NULL CHECK(type IN ('task','email','review')),
            PRIMARY KEY (tenant, id)
        );

        CREATE TABLE IF NOT EXISTS workload (
            tenant          TEXT NOT NULL DEFAULT 'demo',
            assignee        TEXT NOT NULL,
            kind            TEXT NOT NULL CHECK(kind IN ('person','agent')),
            open_tasks      INTEGER NOT NULL DEFAULT 0,
            est_load_score  INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (tenant, assignee)
        );

        CREATE TABLE IF NOT EXISTS decision (
            tenant           TEXT NOT NULL DEFAULT 'demo',
            id               TEXT NOT NULL,
            item_id          TEXT,
            category         TEXT NOT NULL,
            action           TEXT NOT NULL,
            stakes           TEXT NOT NULL CHECK(stakes IN ('low','high')),
            reversible       INTEGER NOT NULL DEFAULT 0,
            was_autonomous   INTEGER NOT NULL DEFAULT 0,
            manager_response TEXT NOT NULL CHECK(manager_response IN ('approved','overridden','edited','pending','n/a')),
            timestamp        TEXT NOT NULL,
            PRIMARY KEY (tenant, id)
        );

        CREATE TABLE IF NOT EXISTS trust (
            tenant            TEXT NOT NULL DEFAULT 'demo',
            category          TEXT NOT NULL,
            trust_level       TEXT NOT NULL CHECK(trust_level IN ('ask','auto')),
            trust_score       REAL NOT NULL DEFAULT 0.33,
            trust_confidence  REAL NOT NULL DEFAULT 0.0,
            auto_threshold    REAL NOT NULL DEFAULT 0.80,
            decay_half_life   INTEGER NOT NULL DEFAULT 30,
            approvals_count   INTEGER NOT NULL DEFAULT 0,
            overrides_count   INTEGER NOT NULL DEFAULT 0,
            ceiling           INTEGER NOT NULL DEFAULT 0,
            risk_profile      TEXT NOT NULL DEFAULT 'medium',
            last_event        TEXT,
            PRIMARY KEY (tenant, category)
        );

        CREATE TABLE IF NOT EXISTS trust_events (
            id           TEXT PRIMARY KEY,
            tenant       TEXT NOT NULL DEFAULT 'demo',
            category     TEXT NOT NULL,
            event_type   TEXT NOT NULL CHECK(event_type IN (
                              'promoted','demoted','score_updated','created','threshold_adjusted')),
            old_level    TEXT,
            new_level    TEXT,
            old_score    REAL,
            new_score    REAL,
            confidence   REAL,
            reason       TEXT NOT NULL,
            decision_id  TEXT,
            timestamp    TEXT NOT NULL
        );
        """)
        _migrate(conn)
        # Always make sure the demo tenant's key exists.
        ensure_tenant(conn, DEMO_TRUST_KEY, DEMO_TENANT, "DailyGate demo")


def _now_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ensure_tenant(conn: sqlite3.Connection, api_key: str, tenant: str, name: str) -> None:
    """Register an api_key → tenant mapping if it does not already exist."""
    conn.execute(
        "INSERT OR IGNORE INTO tenants (api_key, tenant, name, created) VALUES (?,?,?,?)",
        (api_key, tenant, name, _now_ts()),
    )


def resolve_tenant(conn: sqlite3.Connection, api_key: str):
    """Return the tenant id for an api_key, or None if the key is unknown."""
    row = conn.execute(
        "SELECT tenant FROM tenants WHERE api_key = ?", (api_key or "",)
    ).fetchone()
    return row["tenant"] if row else None


def _migrate(conn: sqlite3.Connection) -> None:
    """
    Migrate databases that predate (a) the Bayesian engine and (b) multi-tenancy.
    For pre-tenant tables we can't rewrite the PRIMARY KEY in place, so we add a
    `tenant` column defaulting to 'demo' — existing single-org data becomes the
    demo tenant, and fresh deploys get the full composite-key schema above.
    """
    existing = {row[1] for row in conn.execute("PRAGMA table_info(trust)").fetchall()}
    new_columns = [
        ("trust_score",      "REAL DEFAULT 0.33"),
        ("trust_confidence", "REAL DEFAULT 0.0"),
        ("auto_threshold",   "REAL DEFAULT 0.80"),
        ("decay_half_life",  "INTEGER DEFAULT 30"),
        ("risk_profile",     "TEXT DEFAULT 'medium'"),
        ("last_event",       "TEXT"),
    ]
    for col, defn in new_columns:
        if col not in existing:
            conn.execute(f"ALTER TABLE trust ADD COLUMN {col} {defn}")

    # Add `tenant` to any table that predates multi-tenancy.
    for table in ("work_item", "workload", "decision", "trust", "trust_events"):
        cols = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if "tenant" not in cols:
            conn.execute(
                f"ALTER TABLE {table} ADD COLUMN tenant TEXT NOT NULL DEFAULT 'demo'"
            )
