"""Database Setup and Initialization.

Topology (grid_nodes, grid_edges, alarms) lives in **SQLite** for portability.
DuckDB is kept purely as an analytics engine for parquet / weather queries.
"""
import os
import sqlite3
import hashlib
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
ADMIN_SQLITE_PATH = os.getenv("ADMIN_DB_PATH") or os.getenv("CONFIG_DB_PATH") or str(_PROJECT_ROOT / "admin-console" / "admin-backend" / "admin.sqlite")

# ── DuckDB: analytics engine (weather_recordings + parquet reads) ─
DB_PATH = os.getenv("DB_PATH", str(BASE_DIR / "grid_data_cim.duckdb"))

# ── Parquet directories ───────────────────────────────────────────
PARQUET_DIR = os.getenv("PARQUET_DIR", str(BASE_DIR / "cim_readings"))
PARQUET_ALARMS_DIR = os.getenv("PARQUET_ALARMS_DIR", str(BASE_DIR / "cim_alarms"))


def init_admin_db():
    """Initialises the admin database schema (display rules)."""
    # Ensure the parent directory exists
    admin_db_dir = os.path.dirname(ADMIN_SQLITE_PATH)
    if admin_db_dir and not os.path.exists(admin_db_dir):
        try:
            os.makedirs(admin_db_dir, exist_ok=True)
            print(f"Created directory for admin database: {admin_db_dir}")
        except Exception as e:
            print(f"Warning: Could not create directory {admin_db_dir}: {e}")

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
    # config stores JSON of display configuration (icon, color, etc.)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS display_config_rules (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id           INTEGER NOT NULL REFERENCES display_configs(id) ON DELETE CASCADE,
            name                TEXT NOT NULL,
            priority            INTEGER DEFAULT 0,
            match_conditions    TEXT,
            config              TEXT,
            enabled             INTEGER DEFAULT 1,
            created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # (Migrations for old schema are no longer needed as the table was recreated with consolidated 'config' column)
    
    # Ensure at least one default config exists
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM display_configs")
    if cursor.fetchone()[0] == 0:
        conn.execute("INSERT INTO display_configs (name, is_default) VALUES ('Default Profile', 1)")
    
    # ── Users Table ───────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        salt = os.urandom(16)
        password_hash = hashlib.pbkdf2_hmac('sha256', b"admin", salt, 100000)
        conn.execute(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            ("admin", password_hash.hex(), salt.hex())
        )
        print("Default admin user created.")
    
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
