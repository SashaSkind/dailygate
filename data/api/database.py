"""
SQLite-backed store for DailyGate.
Schema mirrors data/schema.sql exactly for the original four tables.
New tables: trust_events (Bayesian engine audit log).
New columns on trust: trust_score, trust_confidence, auto_threshold,
                       decay_half_life, risk_profile, last_event.
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "dailygate.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS work_item (
            id              TEXT PRIMARY KEY,
            source          TEXT NOT NULL CHECK(source IN ('github','slack','email')),
            title           TEXT NOT NULL,
            owner_suggested TEXT,
            age_days        INTEGER NOT NULL DEFAULT 0,
            status          TEXT NOT NULL CHECK(status IN ('open','in_progress','stale','done')),
            is_duplicate_of TEXT,
            type            TEXT NOT NULL CHECK(type IN ('task','email','review'))
        );

        CREATE TABLE IF NOT EXISTS workload (
            assignee        TEXT PRIMARY KEY,
            kind            TEXT NOT NULL CHECK(kind IN ('person','agent')),
            open_tasks      INTEGER NOT NULL DEFAULT 0,
            est_load_score  INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS decision (
            id               TEXT PRIMARY KEY,
            item_id          TEXT,
            category         TEXT NOT NULL,
            action           TEXT NOT NULL,
            stakes           TEXT NOT NULL CHECK(stakes IN ('low','high')),
            reversible       INTEGER NOT NULL DEFAULT 0,
            was_autonomous   INTEGER NOT NULL DEFAULT 0,
            manager_response TEXT NOT NULL CHECK(manager_response IN ('approved','overridden','edited','pending','n/a')),
            timestamp        TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trust (
            category          TEXT PRIMARY KEY,
            trust_level       TEXT NOT NULL CHECK(trust_level IN ('ask','auto')),
            trust_score       REAL NOT NULL DEFAULT 0.33,
            trust_confidence  REAL NOT NULL DEFAULT 0.0,
            auto_threshold    REAL NOT NULL DEFAULT 0.80,
            decay_half_life   INTEGER NOT NULL DEFAULT 30,
            approvals_count   INTEGER NOT NULL DEFAULT 0,
            overrides_count   INTEGER NOT NULL DEFAULT 0,
            ceiling           INTEGER NOT NULL DEFAULT 0,
            risk_profile      TEXT NOT NULL DEFAULT 'medium',
            last_event        TEXT
        );

        CREATE TABLE IF NOT EXISTS trust_events (
            id           TEXT PRIMARY KEY,
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


def _migrate(conn: sqlite3.Connection) -> None:
    """Add new columns to trust table for databases that predate the Bayesian engine."""
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
