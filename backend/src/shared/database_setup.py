"""Database Setup and Initialization.

Topology (grid_nodes, grid_edges, alarms) lives in **SQLite** for portability.
DuckDB is kept purely as an analytics engine for parquet / weather queries.
"""
import os
import sqlite3
from pathlib import Path

# Robust project root detection (works if run from /app, /app/src, or locally)
_THIS_DIR = Path(__file__).resolve().parent
if _THIS_DIR.name == "shared" and _THIS_DIR.parent.name == "src":
    BASE_DIR = _THIS_DIR.parents[2] # backend/
else:
    BASE_DIR = Path.cwd()

# ── SQLite: topology database (grid_nodes, grid_edges, alarms) ────
# In Docker, we typically mount /data to a volume
DEFAULT_SQLITE = BASE_DIR / "grid_topology.sqlite"
if os.path.exists("/data") and os.access("/data", os.W_OK):
    DEFAULT_SQLITE = Path("/data/grid_topology.sqlite")

SQLITE_PATH = os.getenv("TOPOLOGY_DB_PATH", str(DEFAULT_SQLITE))
# Find project root for admin database (which lives in admin-console/admin-backend)
_PROJECT_ROOT = BASE_DIR if (BASE_DIR / "admin-console").exists() else BASE_DIR.parent
ADMIN_SQLITE_PATH = os.getenv("ADMIN_DB_PATH", str(_PROJECT_ROOT / "admin-console" / "admin-backend" / "admin.sqlite"))

# ── DuckDB: analytics engine (weather_recordings + parquet reads) ─
DB_PATH = os.getenv("DB_PATH", str(BASE_DIR / "grid_data_cim.duckdb"))

# ── Parquet directories ───────────────────────────────────────────
PARQUET_DIR = os.getenv("PARQUET_DIR", str(BASE_DIR / "cim_readings"))
PARQUET_ALARMS_DIR = os.getenv("PARQUET_ALARMS_DIR", str(BASE_DIR / "cim_alarms"))


def init_admin_db():
    """Initialises the admin database schema (display rules)."""
    conn = sqlite3.connect(ADMIN_SQLITE_PATH)
    
    # Tables for display configurations (profiles)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS display_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            is_default INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Table for display rules within a configuration
    # match_conditions stores JSON of CIM conditions
    conn.execute("""
        CREATE TABLE IF NOT EXISTS display_config_rules (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id           INTEGER NOT NULL REFERENCES display_configs(id) ON DELETE CASCADE,
            name                TEXT NOT NULL,
            visual_type         TEXT NOT NULL,
            priority            INTEGER DEFAULT 0,
            match_edge_types    TEXT,
            match_equipment     TEXT,
            match_has_property  TEXT,
            match_conditions    TEXT,
            icon                TEXT,
            color_hex           TEXT,
            size                REAL DEFAULT 1.0,
            label               TEXT,
            css_overrides       TEXT,
            radial_offset       REAL DEFAULT 0.0,
            enabled             INTEGER DEFAULT 1,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Migration: Add css_overrides if it doesn't exist
    try:
        conn.execute("ALTER TABLE display_config_rules ADD COLUMN css_overrides TEXT")
    except sqlite3.OperationalError:
        pass # Already exists
    
    try:
        conn.execute("ALTER TABLE display_config_rules ADD COLUMN radial_offset REAL DEFAULT 0.0")
    except sqlite3.OperationalError:
        pass # Already exists
    
    # Ensure at least one default config exists
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM display_configs")
    if cursor.fetchone()[0] == 0:
        conn.execute("INSERT INTO display_configs (name, is_default) VALUES ('Default Profile', 1)")
    
    conn.commit()
    conn.close()
    print(f"Admin database initialised at {ADMIN_SQLITE_PATH}")


def init_db():
    """Initialises all database schemas."""
    # Topology DB
    conn = sqlite3.connect(SQLITE_PATH)
    # ... (existing code for topology)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS grid_nodes (
            node_id   TEXT PRIMARY KEY,
            model_id  TEXT NOT NULL,
            node_type TEXT NOT NULL,
            name      TEXT,
            phases_present TEXT DEFAULT '["A","B","C"]',
            latitude  REAL,
            longitude REAL,
            is_open   INTEGER DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS grid_edges (
            edge_id      TEXT PRIMARY KEY,
            model_id     TEXT NOT NULL,
            from_node_id TEXT NOT NULL,
            to_node_id   TEXT NOT NULL,
            conductor_type TEXT,
            phases       TEXT DEFAULT '["A","B","C"]'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS alarms (
            alarm_id  TEXT PRIMARY KEY,
            node_id   TEXT,
            timestamp TEXT,
            alarm_code TEXT,
            severity  TEXT,
            message   TEXT,
            is_active INTEGER DEFAULT 1
        )
    """)
    conn.commit()
    conn.close()
    print(f"Topology database initialised at {SQLITE_PATH}")

    # Admin DB
    init_admin_db()


if __name__ == "__main__":
    init_db()
